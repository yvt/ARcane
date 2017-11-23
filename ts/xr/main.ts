import { ARController, ARCameraParam } from './artoolkit';

import { Stopwatch } from '../utils/time';
import { LogManager, Logger } from '../utils/logger';
import { downcast } from '../utils/utils';
import { Signal } from '../utils/signal';

// Binary camera parameter data
const cameraParamData = require('binary-loader!./camera_para.dat');

export enum ARState
{
    Inactive,
    Activating,
    Active,
    Error,
}

export class ARMain
{
    state = ARState.Inactive;

    activeState: {
        ctrler: ARController;
        cameraParam: ARCameraParam;
        mediaStream: MediaStream;
    } | null = null;

    frameRate: number | null = null;

    readonly onChangeState = new Signal<void>();

    private readonly log: Logger;
    private meteringStopwatch = new Stopwatch();

    constructor(logManager: LogManager)
    {
        this.log = logManager.getLogger('ar');
    }

    get isPlaying(): boolean
    {
        if (this.activeState) {
            return !(this.video!).paused;
        } else {
            return false;
        }
    }

    get video(): HTMLVideoElement | null
    {
        return this.activeState && downcast(HTMLVideoElement, this.activeState.ctrler.image);
    }

    tryActivate(): void
    {
        if (this.state == ARState.Inactive) {
            this.state = ARState.Activating;
            ARController.getUserMediaARController({
                onSuccess: (ctrler, param, stream) => {
                    const videoTrack = stream.getVideoTracks()[0];
                    this.frameRate = videoTrack.getSettings().frameRate!;
                    this.activeState = {
                        ctrler,
                        cameraParam: param,
                        mediaStream: stream,
                    };
                    this.state = ARState.Active;
                    this.log.log(`ARController created`);
                    this.onChangeState.invoke(this, void 0);
                },
                onError: (error: any) => {
                    this.state = ARState.Error;
                    this.log.error(`getUserMediaARController failed: ${error}`);
                    this.onChangeState.invoke(this, void 0);
                },
                // `loadCamera` accepts raw data too! (but it must have the `\n`
                // character)
                cameraParam: cameraParamData,
                facingMode: 'environment',
                maxARVideoSize: 320,
            });
            this.onChangeState.invoke(this, void 0);
        }
    }

    play(): void
    {
        if (this.activeState) {
            this.video!.play();
        } else {
            throw new Error("No ARController");
        }
    }

    stop(): void
    {
        if (this.activeState) {
            this.video!.pause();
        }
    }

    update(): boolean
    {
        if (!this.activeState) {
            return false;
        }

        // Meter the rendering by the camera's frame rate.
        // It is impossible to know when exactly we get a new frame from the
        // camera since no API is provided for that purpose.
        const frameInterval = 1000 / this.frameRate!;
        if (this.meteringStopwatch.elapsed < frameInterval - 0.01) {
            // No new frame (probably)
            return false;
        }
        this.meteringStopwatch.reset();

        // Detect markers
        this.activeState.ctrler.process();

        return true;
    }
}