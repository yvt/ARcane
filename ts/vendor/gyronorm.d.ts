declare module 'gyronorm' {
    export interface GyroEvent {
        do?: {
            alpha: number;
            beta: number;
            gamma: number;
            absolute: boolean;
        };
        dm?: {
            x: number;
            y: number;
            z: number;

            gx: number;
            gy: number;
            gz: number;

            alpha: number;
            beta: number;
            gamma: number;
        };
    }

    export default class GyroNorm {
        /*
        *
        * Initialize GyroNorm instance function
        *
        * @param object options - values are as follows. If set in the init function they overwrite the default option values
        * @param int options.frequency
        * @param boolean options.gravityNormalized
        * @param boolean options.orientationBase
        * @param boolean options.decimalCount
        * @param function options.logger
        * @param function options.screenAdjusted
        *
        */
        init(): Promise<void>;
        end(): void;
        start(callback: (data: GyroEvent) => void): void;
        stop(): void;

        normalizeGravity(flag: boolean): void;
        setHeadDirection(): boolean;
        startLogging(logger: any): void;
        stopLogging(): void;

        isAvailable(eventType: 'deviceorientation' | 'devicemotion' | 'compassneedscalibration'): boolean;
        isRunning(): boolean;
    }
}