import { LogManager } from "../utils/logger";
import { Profiler } from "./profiler";
import { RenderPipeline, RenderOperation, dumpRenderOperationAsDot } from "./scheduler";
import { GLContext } from "./globjs/context";
import { TOPICS } from "./log";

import { QuadRenderer } from './quad';
import { Blitter } from './subpasses/blit';

import { PresentPass } from './passes/present';
import { RaytracePass } from './passes/raytrace';
import { GlobalLightingPass } from './passes/globallighting';
import { VisualizeColorBufferPass } from './passes/visualize';
import { SsaoPass } from './passes/ssao/toplevel';

import { Scene } from './model';
import { VoxelData, VoxelDataManager } from './voxeldata';

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
    private readonly visualizeColorBufferPass: VisualizeColorBufferPass;

    private lastWidth: number = 0;
    private lastHeight: number = 0;

    readonly scene = new Scene();
    readonly voxelManager: VoxelDataManager;
    readonly voxel: VoxelData;

    constructor(public readonly gl: WebGLRenderingContext, public readonly log: LogManager)
    {
        this.context = new GLContext(gl, log);

        if (!this.context.ext.EXT_shader_texture_lod) {
            throw new Error("EXT_shader_texture_lod is not supported. Cannot proceed.");
        }

        this.voxelManager = new VoxelDataManager(this);
        this.voxel = this.voxelManager.createVoxelData();

        this.profiler = new Profiler(this.context.ext.EXT_disjoint_timer_query, log.getLogger(TOPICS.PROFILER));
        this.pipeline = new RenderPipeline(log.getLogger(TOPICS.SCHEDULER), this.profiler, this.context);
        this.quad = new QuadRenderer(this.context);
        this.blitter = new Blitter(this, 'mediump');

        this.presentPass = new PresentPass(this.context);
        this.raytracePass = new RaytracePass(this);
        this.ssaoPass = new SsaoPass(this);
        this.globalLightingPass = new GlobalLightingPass(this);
        this.visualizeColorBufferPass = new VisualizeColorBufferPass(this);
    }

    dispose(): void
    {
        this.presentPass.dispose();
        this.raytracePass.dispose();
        this.ssaoPass.dispose();
        this.globalLightingPass.dispose();
        this.visualizeColorBufferPass.dispose();

        this.voxel.dispose();

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

        const output = this.visualizeColorBufferPass.setup(lit, ops);

        const logger = this.log.getLogger(TOPICS.SCHEDULER);
        if (logger.isEnabled) {
            logger.log(dumpRenderOperationAsDot(ops));
        }

        this.pipeline.setup(ops, [output]);
    }

    render(): void
    {
        const {gl} = this.context;

        if (gl.drawingBufferWidth != this.lastWidth || gl.drawingBufferHeight != this.lastHeight) {
            this.lastWidth = gl.drawingBufferWidth;
            this.lastHeight = gl.drawingBufferHeight;
            this.compilePipeline();
        }

        this.context.begin();
        this.profiler.beginFrame();
        this.pipeline.render();
        this.profiler.finalizeFrame();
    }
}
