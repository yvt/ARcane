import { vec3 } from 'gl-matrix';

import { assertEq } from '../utils/utils';
import { WorkData, WorkDataConstants, mapIndex } from './work';

const enum Constants
{
    LOG_GRID_SIZE = 8,
    GRID_SIZE = 1 << LOG_GRID_SIZE,
    THRESHOLD = 128,
}
assertEq(Constants.GRID_SIZE, WorkDataConstants.GRID_SIZE);

export interface CubeFace
{
    /** Normal. Do not modify! */
    readonly normal: vec3;
}

export const FACE_POS_X: CubeFace = { normal: vec3.fromValues(+1, 0, 0) };
export const FACE_NEG_X: CubeFace = { normal: vec3.fromValues(-1, 0, 0) };
export const FACE_POS_Y: CubeFace = { normal: vec3.fromValues(0, +1, 0) };
export const FACE_NEG_Y: CubeFace = { normal: vec3.fromValues(0, -1, 0) };
export const FACE_POS_Z: CubeFace = { normal: vec3.fromValues(0, 0, +1) };
export const FACE_NEG_Z: CubeFace = { normal: vec3.fromValues(0, 0, -1) };

export interface RaytraceHit
{
    hit: boolean;

    /** The coordinates of the voxel the ray hit. */
    voxel: vec3;

    normal: CubeFace | null;

    /** The point the ray hit a voxel. */
    position: vec3;
}

function truncateToward(x: number, sign: number): number
{
    if (sign >= 0) {
        return Math.floor(x);
    } else {
        return Math.ceil(x) - 1;
    }
}

export function raytrace(
    data: WorkData,
    start: vec3,
    to: vec3,
    last?: RaytraceHit | null,
): RaytraceHit
{
    if (!last) {
        last = {
            hit: false,
            voxel: vec3.create(),
            normal: null,
            position: vec3.create(),
        };
    }

    const {voxel, position} = last;
    vec3.copy(position, start);
    last.hit = false;
    last.normal = null;

    const diffX = to[0] - start[0], signX = Math.sign(diffX), signIX = signX | 0;
    const diffY = to[1] - start[1], signY = Math.sign(diffY), signIY = signY | 0;
    const diffZ = to[2] - start[2], signZ = Math.sign(diffZ), signIZ = signZ | 0;
    const startIX = truncateToward(start[0], diffX) | 0;
    const startIY = truncateToward(start[1], diffY) | 0;
    const startIZ = truncateToward(start[2], diffZ) | 0;
    const startInside = (startIX | startIY | startIZ) >>> 0 < Constants.GRID_SIZE;

    if (startInside && data.density[data.mapIndex(startIX, startIY, startIZ)] >= Constants.THRESHOLD) {
        last.hit = true;
        vec3.set(voxel, startIX, startIY, startIZ);
        return last;
    }

    if (signX === 0 && signY === 0 && signZ === 0) {
        return last;
    }

    const len = Math.max(Math.abs(diffX), Math.abs(diffY), Math.abs(diffZ));
    const dirX = diffX / len, recipX = 1 / dirX;
    const dirY = diffY / len, recipY = 1 / dirY;
    const dirZ = diffZ / len, recipZ = 1 / dirZ;

    if (!startInside) {
        // Clip by AABB
        if (signX > 0 && position[0] < 0) {
            if (to[0] < 0) {
                return last;
            }
            const t = position[0] / -dirX;
            position[0] = 0;
            position[1] += dirY * t;
            position[2] += dirZ * t;
            last.normal = FACE_NEG_X;
        } else if (signX < 0 && position[0] > Constants.GRID_SIZE) {
            if (to[0] > Constants.GRID_SIZE) {
                return last;
            }
            const t = (Constants.GRID_SIZE - position[0]) / dirX;
            position[0] = Constants.GRID_SIZE;
            position[1] += dirY * t;
            position[2] += dirZ * t;
            last.normal = FACE_POS_X;
        }
        if (signY > 0 && position[1] < 0) {
            if (to[1] < 0) {
                return last;
            }
            const t = position[1] / -dirY;
            position[0] += dirX * t;
            position[1] = 0;
            position[2] += dirZ * t;
            last.normal = FACE_NEG_Y;
        } else if (signY < 0 && position[1] > Constants.GRID_SIZE) {
            if (to[1] > Constants.GRID_SIZE) {
                return last;
            }
            const t = (Constants.GRID_SIZE - position[1]) / dirY;
            position[0] += dirX * t;
            position[1] = Constants.GRID_SIZE;
            position[2] += dirZ * t;
            last.normal = FACE_POS_Y;
        }
        if (signZ > 0 && position[2] < 0) {
            if (to[2] < 0) {
                return last;
            }
            const t = position[2] / -dirZ;
            position[0] += dirX * t;
            position[1] += dirY * t;
            position[2] = 0;
            last.normal = FACE_NEG_Z;
        } else if (signZ < 0 && position[2] > Constants.GRID_SIZE) {
            if (to[2] > Constants.GRID_SIZE) {
                return last;
            }
            const t = (Constants.GRID_SIZE - position[2]) / dirZ;
            position[0] += dirX * t;
            position[1] += dirY * t;
            position[2] = Constants.GRID_SIZE;
            last.normal = FACE_POS_Z;
        }
    }

    let voxelX = truncateToward(position[0], diffX) | 0;
    let voxelY = truncateToward(position[1], diffY) | 0;
    let voxelZ = truncateToward(position[2], diffZ) | 0;
    const startInside2 = (voxelX | voxelY | voxelZ) >>> 0 < Constants.GRID_SIZE;
    if (!startInside2) {
        return last;
    }

    let curIndex = mapIndex(voxelX, voxelY, voxelZ);
    let timeToNextX = (voxelX + Math.max(signX, 0) - position[0]) * recipX;
    let timeToNextY = (voxelY + Math.max(signY, 0) - position[1]) * recipY;
    let timeToNextZ = (voxelZ + Math.max(signZ, 0) - position[2]) * recipZ;
    let leftTime = len;

    const offsX = signIX | 0;
    const offsY = signIY * Constants.GRID_SIZE | 0;
    const offsZ = signIZ * Constants.GRID_SIZE * Constants.GRID_SIZE | 0;

    const faceX = signX >= 0 ? FACE_NEG_X : FACE_POS_X;
    const faceY = signY >= 0 ? FACE_NEG_Y : FACE_POS_Y;
    const faceZ = signZ >= 0 ? FACE_NEG_Z : FACE_POS_Z;

    do {
        if (data.density[curIndex] >= Constants.THRESHOLD) {
            last.hit = true;
            vec3.set(voxel, voxelX, voxelY, voxelZ);

            const d = len - leftTime;
            position[0] += dirX * d;
            position[1] += dirY * d;
            position[2] += dirZ * d;
            return last;
        }

        // Find the next intersection with a X/Y/Z plane
        const timeToNextPlane = Math.min(timeToNextX, timeToNextY, timeToNextZ);
        if (timeToNextX === timeToNextPlane) {
            timeToNextX = Math.abs(recipX);
            timeToNextY -= timeToNextPlane;
            timeToNextZ -= timeToNextPlane;
            voxelX = voxelX + signIX | 0;
            curIndex = curIndex + offsX | 0;
            last.normal = faceX;
        } else if (timeToNextY === timeToNextPlane) {
            timeToNextX -= timeToNextPlane;
            timeToNextY = Math.abs(recipY);
            timeToNextZ -= timeToNextPlane;
            voxelY = voxelY + signIY | 0;
            curIndex = curIndex + offsY | 0;
            last.normal = faceY;
        } else {
            timeToNextX -= timeToNextPlane;
            timeToNextY -= timeToNextPlane;
            timeToNextZ = Math.abs(recipZ);
            voxelZ = voxelZ + signIZ | 0;
            curIndex = curIndex + offsZ | 0;
            last.normal = faceZ;
        }

        leftTime -= timeToNextPlane;
    } while (((voxelX | voxelY | voxelZ) >> Constants.LOG_GRID_SIZE) === 0 && leftTime > 0);

    return last;
}