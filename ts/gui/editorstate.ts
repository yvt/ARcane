/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec2, vec3, mat4 } from 'gl-matrix';
import { UIColor, UIRgbColor } from './utils/color';
import { Work } from '../model/work';
import { createWork, mapIndex } from '../model/work';
import { EditHistoryState } from './edit';
require('../storage/local');

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

    readonly workspace: Workspace | null;
}

export interface Workspace
{
    readonly work: Work;

    readonly history: EditHistoryState;
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
    return {
        displayMode: DisplayMode.Normal,
        camera: {
            center: vec3.fromValues(20, 20, 20),
            eulerAngles: vec2.fromValues(Math.PI / 4, Math.PI / 5),
            distance: 100,
        },
        inputDevicesInUse: {
            touch: false,
            mouse: false,
        },
        viewportHot: false,
        activeColor: new UIRgbColor(0.2, 0.25, 0.4, 1),
        activeRoughness: 32,
        activeMaterial: 0,
        workspace: null,
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