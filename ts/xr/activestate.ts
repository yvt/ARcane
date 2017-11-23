import { mat4 } from 'gl-matrix';

import { ARController, ARCameraParam, artoolkit } from './artoolkit';

import { Stopwatch } from '../utils/time';
import { LogManager, Logger } from '../utils/logger';
import { downcast } from '../utils/utils';

import { initializeMinSubmarker } from './artoolkitpatch';

// Multimarker configuration data (text)
const multimarkerData: string = require('binary-loader!./multimarker_barcode_4x3.dat');

export class ARActiveState
{
    private arController: ARController;
    private arCameraParam: ARCameraParam;
    private mediaStream: MediaStream;
    private multimarkerUid: number;
    private frameRate: number;

    video: HTMLVideoElement;

    private readonly log: Logger;
    private meteringStopwatch = new Stopwatch();

    markerFound = false;
    /** The view matrix mapping the marker space to the view space. */
    markerMatrix = mat4.create();

    private constructor() {}

    /** @internal */
    static async create(
        log: Logger,
        mediaStream: MediaStream,
        arController: ARController,
        arCameraParam: ARCameraParam,
        video: HTMLVideoElement,
    ): Promise<ARActiveState>
    {
        // arController.debugSetup();

        const activeState = new ARActiveState();
        activeState.arController = arController;
        activeState.arCameraParam = arCameraParam;
        activeState.mediaStream = mediaStream;
        activeState.video = video;

        const videoTrack = mediaStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        log.log(`Camera image size: ${settings.width} x ${settings.height}`);
        log.log(`Camera frame rate: ${settings.frameRate}`);

        activeState.frameRate = settings.frameRate!;

        // This is not supposed to fail
        const multimarkerUid = await arController.loadMultiMarkerPromise({
            url: 'pinkie',
            fetcher: (_) => Promise.resolve(multimarkerData),
        });
        if (multimarkerUid < 0) {
            throw new Error(`loadMultiMarkerPromise failed (in an undocumented way)`);
        }
        log.log(`Multimarker UID: ${multimarkerUid}`);

        // Initialize `((ARMultiMarkerInfoT *)arMulti)->min_submarker`.
        //
        // Its value is supposed to be initialized to 0, but it actually contains
        // a random value because jsartoolkit forgot to do that. And I did not
        // want to fork jsartoolkit to fix it because its git repository is so
        // bloated up because for some mysterious reason they decided to include
        // EVERY version of the compiled Emscripten module in the repository.
        initializeMinSubmarker(arController.id, multimarkerUid);

        // Called by `ARController.process`
        arController.addEventListener('getMultiMarker', (e) => {
            activeState.markerFound = true;
            activeState.markerMatrix.set(e.data.matrix);
        });

        return activeState;
    }

    update(): boolean
    {
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
        this.markerFound = false;
        this.arController.process();

        return true;
    }

    get projectionMatrix(): mat4
    {
        const m = mat4.create();
        m.set(this.arController.getCameraMatrix());
        return m;
    }

    get lastProcessedImage(): HTMLCanvasElement
    {
        return this.arController.canvas;
    }

    get isPlaying(): boolean
    {
        return !this.video.paused;
    }

    play(): void
    {
        this.video.play();
    }

    stop(): void
    {
        this.video.pause();
    }
}
