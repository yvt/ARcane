import { ARController, ARCameraParam } from './artoolkit';

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
}