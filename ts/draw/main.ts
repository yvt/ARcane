import { LogManager } from "../utils/logger";
import { Profiler } from "./profiler";
import { RenderPipeline, RenderOperation, dumpRenderOperationAsDot } from "./scheduler";
import { GLContext } from "./globjs/context";
import { TOPICS } from "./log";
import { PresentPass } from './passes/present';

export class Renderer
{
    readonly context: GLContext;
    private readonly profiler: Profiler;
    readonly pipeline: RenderPipeline<GLContext>;

    readonly presentPass: PresentPass;

    private lastWidth: number = 0;
    private lastHeight: number = 0;

    constructor(public readonly gl: WebGLRenderingContext, public readonly log: LogManager)
    {
        this.context = new GLContext(gl, log);
        this.profiler = new Profiler(this.context.ext.EXT_disjoint_timer_query, log.getLogger(TOPICS.PROFILER));
        this.pipeline = new RenderPipeline(log.getLogger(TOPICS.SCHEDULER), this.profiler, this.context);

        this.presentPass = new PresentPass(this.context);
    }

    dispose(): void
    {
        this.pipeline.releaseAll();
        this.profiler.dispose();
    }

    compilePipeline(): void
    {
        const ops: RenderOperation<GLContext>[] = [];

        const output = this.presentPass.setup(ops);

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
