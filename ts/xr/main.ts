/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { ARController, ARCameraParam } from './artoolkit';

import { LogManager, Logger } from '../utils/logger';
import { Signal } from '../utils/signal';

import { ARActiveState } from './activestate';

// Camera parameter data (binary)
const cameraParamData: string = require('binary-loader!./camera_para-iPhone-5-rear-640x480-1.0m.dat');

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

    activeState: ARActiveState | null = null;

    readonly onChangeState = new Signal<void>();

    private readonly log: Logger;

    constructor(logManager: LogManager)
    {
        this.log = logManager.getLogger('ar');
    }

    tryActivate(): void
    {
        if (this.state == ARState.Inactive) {
            this.activate();
        }
    }

    private async activate(): Promise<void>
    {
        this.state = ARState.Activating;
        this.onChangeState.invoke(this, void 0);

        let stream: MediaStream;
        let arController: ARController;
        let arCameraParam: ARCameraParam;
        let video: HTMLVideoElement;

        try {
            ({stream, arController, arCameraParam, video} =
                await ARController.getUserMediaARControllerPromise({
                    // `loadCamera` accepts raw data too! (but it must have the `\n`
                    // character)
                    cameraParam: cameraParamData,
                    facingMode: 'environment',
                    maxARVideoSize: 320,
                }));
        } catch (e) {
            this.state = ARState.Error;
            this.log.error(`getUserMediaARController failed: ${e}`);
            this.onChangeState.invoke(this, void 0);
            return;
        }
        this.log.log(`ARController created`);

        this.activeState = await ARActiveState.create(
            this.log,
            stream,
            arController,
            arCameraParam,
            video,
        );

        this.state = ARState.Active;
        this.onChangeState.invoke(this, void 0);
    }
}