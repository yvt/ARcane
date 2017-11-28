/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { mat4 } from 'gl-matrix';

const listeners = new Map<DeviceOrientationListener, true>();

export interface OrientationMeasurement
{
    alpha: number;
    beta: number;
    gamma: number;
    absolute: boolean;
    matrix: mat4;
}

const degtorad = Math.PI / 180;

function gyroCallback(e: DeviceOrientationEvent): void
{
    // https://w3c.github.io/deviceorientation/spec-source-orientation.html
    const x = (e.beta || 0) * degtorad;
    const y = (e.gamma || 0) * degtorad;
    const z = (e.alpha || 0) * degtorad;

    const cX = Math.cos( x );
    const cY = Math.cos( y );
    const cZ = Math.cos( z );
    const sX = Math.sin( x );
    const sY = Math.sin( y );
    const sZ = Math.sin( z );

    const m11 = cZ * cY - sZ * sX * sY;
    const m12 = - cX * sZ;
    const m13 = cY * sZ * sX + cZ * sY;

    const m21 = cY * sZ + cZ * sX * sY;
    const m22 = cZ * cX;
    const m23 = sZ * sY - cZ * cY * sX;

    const m31 = - cX * sY;
    const m32 = sX;
    const m33 = cX * cY;

    const measurement: OrientationMeasurement = {
        alpha: e.alpha || 0,
        gamma: e.gamma || 0,
        beta: e.beta || 0,
        absolute: e.absolute,
        matrix: mat4.fromValues(m11, m21, m31, 0, -m12, -m22, -m32, 0, m13, m23, m33, 0, 0, 0, 0, 1),
    };

    let screenOrient = 0;
    if (typeof window.orientation === 'number') {
        // (deprecated but supported on iOS)
        screenOrient = window.orientation;
    } else {
        const scrOrientation = (<any>screen).orientation || screen.msOrientation;
        // TODO: how can I know the "natural" orientation
    }
    mat4.rotate(measurement.matrix, measurement.matrix, screenOrient * Math.PI / 180, [0, 0, 1]);

    listeners.forEach((_, listener) => {
        if (listener.onData) {
            listener.onData(measurement);
        }
    })
}

export class DeviceOrientationListener
{
    onData: ((e: OrientationMeasurement) => void) | null = null;

    private constructor()
    {
        listeners.set(this, true);
        if (listeners.size === 1) {
            window.addEventListener('deviceorientation', gyroCallback);
        }
    }

    public static async create(): Promise<DeviceOrientationListener>
    {
        return new DeviceOrientationListener();
    }

    dispose(): void
    {
        listeners.delete(this);
        if (listeners.size === 0) {
            window.removeEventListener('deviceorientation', gyroCallback);
        }
    }
}
