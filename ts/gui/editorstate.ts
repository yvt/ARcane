/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2, vec3, mat4 } from 'gl-matrix';
import { UIColor, UIRgbColor } from './utils/color';
import { Workspace } from '../model/workspace';
import { createWork, mapIndex } from '../model/work';

export interface EditorState
{
    readonly displayMode: DisplayMode;
    readonly camera: CameraState;

    /** Types of input devices that have been used. Used to generate an appropriate help message. */
    readonly inputDevicesInUse: {
        readonly touch: boolean;
        readonly mouse: boolean;
    };

    /** The mouse pointer is on the viewport region. */
    readonly viewportHot: boolean;

    readonly activeColor: UIColor;

    /** An integer in range `[0, 63]` */
    readonly activeRoughness: number;

    /** An integer in range `[0, 1]` */
    readonly activeMaterial: number;

    readonly workspace: Workspace;
}

export interface CameraState
{
    // Note: These `vec3`s are immutable. Do not modify the elements!
    readonly center: vec3;

    readonly eulerAngles: vec2;

    readonly distance: number;
}

export enum DisplayMode
{
    Normal = 'normal',
    AR = 'ar',
}

export function createEditorState(): EditorState
{
    // DEBUG: create a pre-initialized work
    let work = createWork();
    work = {
        ... work,
        data: work.data.mutate(context => {
            const dens = context.data.density;
            const mat = context.data.material;

            for (let z = 0; z < 256; ++z) {
                for (let y = 0; y < 256; ++y) {
                    for (let x = 0; x < 256; ++x) {
                        let v = Math.sin(x / 20) + Math.sin(y / 20) + Math.cos(z / 20) + Math.sin((x ^ y ^ z) * .1) * 0.5;
                        v *= Math.max(0, 128 * 128 - Math.pow(x - 128, 2) - Math.pow(y - 128, 2) - Math.pow(z - 128, 2)) / 128 / 128;
                        v += (v - 0.5) * 4;
                        v = Math.max(Math.min(v * 255 | 0, 255), 0);

                        dens[mapIndex(x, y, z)] = v;

                        const gloss = Math.min((z + Math.random() * 4) >> 2, 63);
                        const material = x > 128 ? 1 /* metallic */ : 0 /* dielectric */;
                        mat[mapIndex(x, y, z)] = (x > 128 ? 0xa0a0a0 : 0x8090f0) | (gloss << 24) | (material << 30);
                    }
                }
            }

            context.markDirty([0, 0, 0], [256, 256, 256]);
        }),
    };
    return {
        displayMode: DisplayMode.Normal,
        camera: {
            center: vec3.fromValues(128, 128, 128),
            eulerAngles: vec2.fromValues(Math.PI / 4, Math.PI / 5),
            distance: 200,
        },
        inputDevicesInUse: {
            touch: false,
            mouse: false,
        },
        viewportHot: false,
        activeColor: new UIRgbColor(0.2, 0.25, 0.4, 1),
        activeRoughness: 32,
        activeMaterial: 0,
        workspace: { work },
    };
}

export const UP = vec3.fromValues(0, 1, 0);

/** Provides computed properties for `CameraState`. */
export class CameraStateInfo
{
    constructor(public readonly data: CameraState)
    {}

    get eye(): vec3
    {
        const {center, eulerAngles, distance} = this.data;
        const ret = vec3.clone(center);
        ret[0] += Math.cos(eulerAngles[0]) * Math.cos(eulerAngles[1]) * distance;
        ret[1] += Math.sin(eulerAngles[1]) * distance;
        ret[2] += Math.sin(eulerAngles[0]) * Math.cos(eulerAngles[1]) * distance;
        return ret;
    }

    get viewMatrix(): mat4
    {
        return mat4.lookAt(
            mat4.create(),
            this.eye,
            this.data.center,
            UP
        );
    }
}