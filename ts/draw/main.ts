/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { LogManager } from "../utils/logger";
import { Profiler, ProfilerResult } from "./profiler";
import { RenderPipeline, RenderOperation, dumpRenderOperationAsDot } from "./scheduler";
import { GLContext } from "./globjs/context";
import { TOPICS } from "./log";
import { WorkerClient } from '../utils/workerboot';

import { service } from './worker/port';
import { EnvironmentEstimatorClient } from './worker/envestimator_client';

import { QuadRenderer } from './quad';
import { Blitter } from './subpasses/blit';

import { PresentPass } from './passes/present';
import { RaytracePass } from './passes/raytrace';
import { GlobalLightingPass } from './passes/globallighting';
import { GizmoPass } from './passes/gizmo';
import { VisualizeColorBufferPass } from './passes/visualize';
import { SsaoPass } from './passes/ssao/toplevel';

import { Scene, CameraImageData } from './model';
import { VoxelData, VoxelDataManager } from './voxeldata';
import { CameraImage } from './cameraimage';

export class Renderer
{
    readonly context: GLContext;
    private readonly profiler: Profiler;
    private readonly pipeline: RenderPipeline<GLContext>;

    readonly quad: QuadRenderer;
    readonly blitter: Blitter;

    private readonly presentPass: PresentPass;
    private readonly raytracePass: RaytracePass;
    private readonly ssaoPass: SsaoPass;
    private readonly globalLightingPass: GlobalLightingPass;
    private readonly gizmoPass: GizmoPass;
    private readonly visualizeColorBufferPass: VisualizeColorBufferPass;

    private lastWidth = 0;
    private lastHeight = 0;
    private lastEnableAR = false;

    readonly scene = new Scene();
    readonly voxelManager: VoxelDataManager;
    readonly voxel: VoxelData;
    readonly cameraImage: CameraImage;

    private worker: WorkerClient;
    environmentEstimator: EnvironmentEstimatorClient;

    constructor(
        public readonly gl: WebGLRenderingContext,
        public readonly log: LogManager,
        private workerFactory: () => WorkerClient,
    )
    {
        this.context = new GLContext(gl, log);

        if (!this.context.ext.EXT_shader_texture_lod) {
            throw new Error("EXT_shader_texture_lod is not supported. Cannot proceed.");
        }
        if (!this.context.ext.OES_standard_derivatives) {
            throw new Error("OES_standard_derivatives is not supported. Cannot proceed.");
        }

        this.voxelManager = new VoxelDataManager(this);
        this.voxel = this.voxelManager.createVoxelData();
        this.cameraImage = new CameraImage(this.context);

        this.profiler = new Profiler(this.context.ext.EXT_disjoint_timer_query, log.getLogger(TOPICS.PROFILER));
        this.pipeline = new RenderPipeline(log.getLogger(TOPICS.SCHEDULER), this.profiler, this.context);
        this.quad = new QuadRenderer(this.context);
        this.blitter = new Blitter(this, 'mediump');

        this.presentPass = new PresentPass(this.context);
        this.raytracePass = new RaytracePass(this);
        this.ssaoPass = new SsaoPass(this);
        this.globalLightingPass = new GlobalLightingPass(this);
        this.gizmoPass = new GizmoPass(this);
        this.visualizeColorBufferPass = new VisualizeColorBufferPass(this);

        this.worker = workerFactory();
        this.environmentEstimator = new EnvironmentEstimatorClient({
            host: this.worker.host,
            context: this.context,
            scene: this.scene,
        });
        this.worker.call(service, { ...this.environmentEstimator.bootParam });
    }

    dispose(): void
    {
        this.worker.dispose();
        this.worker.worker.terminate();

        this.presentPass.dispose();
        this.raytracePass.dispose();
        this.ssaoPass.dispose();
        this.globalLightingPass.dispose();
        this.gizmoPass.dispose();
        this.visualizeColorBufferPass.dispose();

        this.voxel.dispose();
        this.cameraImage.dispose();

        this.pipeline.releaseAll();
        this.profiler.dispose();
    }

    compilePipeline(): void
    {
        const ops: RenderOperation<GLContext>[] = [];

        const g1 = this.raytracePass.setup(
            this.context.gl.drawingBufferWidth,
            this.context.gl.drawingBufferHeight,
            ops,
        );

        const ssao = this.ssaoPass.setup(g1, ops);

        const lit = this.globalLightingPass.setup(g1, ssao, ops);

        const litWithGizmos = this.gizmoPass.setup(g1, lit, ops);

        const output = this.visualizeColorBufferPass.setup(litWithGizmos, ops);

        const logger = this.log.getLogger(TOPICS.SCHEDULER);
        if (logger.isEnabled) {
            logger.log(dumpRenderOperationAsDot(ops));
        }

        this.pipeline.setup(ops, [output]);
    }

    render(): void
    {
        const {gl} = this.context;

        if (
            gl.drawingBufferWidth != this.lastWidth ||
            gl.drawingBufferHeight != this.lastHeight ||
            this.scene.enableAR != this.lastEnableAR
        ) {
            this.lastWidth = gl.drawingBufferWidth;
            this.lastHeight = gl.drawingBufferHeight;
            this.lastEnableAR = this.scene.enableAR;
            this.compilePipeline();
        }

        this.context.begin();
        this.profiler.beginFrame();
        this.pipeline.render();
        this.profiler.finalizeFrame();
    }

    setCameraImage(data: CameraImageData): void
    {
        this.cameraImage.updateWith(data);
        this.environmentEstimator.update(data);
    }

    startProfiling(callback?: (result: ProfilerResult) => void): void
    {
        this.profiler.startProfiling(callback);
    }

    stopProfiling(): void
    {
        this.profiler.stopProfiling();
    }
}
