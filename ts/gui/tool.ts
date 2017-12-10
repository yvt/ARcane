/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import { vec3, vec4 } from 'gl-matrix';

import { Gizmo, LineGizmo, LineStyle } from '../draw/model';
import { WorkData, Work } from '../model/work';
import { raytrace, RaytraceHit, FACE_POS_Y } from '../model/raytrace';

import { EditorState, Workspace } from './editorstate';
import { Edit } from './edit';

export abstract class EditTool
{
    _editToolBrand: {};

    getGizmos(input: PointerInput): Gizmo[] { return []; }
    startStroke(input: PointerInput): [Stroke, Workspace] | null { return null; }
}

export interface Stroke
{
    getGizmos?(input: PointerInput): Gizmo[];
    move(input: PointerInput): Workspace;
    end(state: EditorState & { workspace: Workspace }): Workspace;
}

export interface PointerInput
{
    /** The X coordinate of the mouse or touch position. (TODO: in what coordinate?) */
    readonly x: number;

    /** The Y coordinate of the mouse or touch position. (TODO: in what coordinate?) */
    readonly y: number;

    readonly rayStart: vec3;
    readonly rayEnd: vec3;

    readonly state: EditorState & { workspace: Workspace };
}

function rayTraceWithFloor(
    data: Work,
    start: vec3,
    to: vec3,
    last?: RaytraceHit | null,
): RaytraceHit
{
    const hit = raytrace(data.data.expectData(), start, to, last);
    if (!hit.hit) {
        if (start[1] > 1 && to[1] < 1) {
            const t = (1 - start[1]) / (to[1] - start[1]);
            const x = hit.position[0] = start[0] + (to[0] - start[0]) * t;
            hit.position[1] = 1;
            const z = hit.position[2] = start[2] + (to[2] - start[2]) * t;
            if (x >= 1 && x < data.props.extents[0] + 1 && z >= 1 && z < data.props.extents[2] + 1) {
                hit.hit = true;
                vec3.set(hit.voxel, Math.floor(x), 0, Math.floor(z));
                hit.normal = FACE_POS_Y;
            }
        }
    }
    return hit;
}

function editorStateMaterial(state: EditorState): number
{
    const color = state.activeColor.toRgb().toBgr8();
    return color | (63 - state.activeRoughness << 24) | (state.activeMaterial << 30);
}

class AttachEditTool extends EditTool
{
    getGizmos(input: PointerInput): Gizmo[]
    {
        const hit = rayTraceWithFloor(
            input.state.workspace.work,
            input.rayStart,
            input.rayEnd,
        );

        if (hit.hit && hit.normal) {
            const gizmos: Gizmo[] = [];
            const bx = Math.max(0, hit.normal.normal[0]) + hit.voxel[0];
            const by = Math.max(0, hit.normal.normal[1]) + hit.voxel[1];
            const bz = Math.max(0, hit.normal.normal[2]) + hit.voxel[2];
            const tan1x = Math.abs(hit.normal.normal[2]);
            const tan1y = Math.abs(hit.normal.normal[0]);
            const tan1z = Math.abs(hit.normal.normal[1]);
            const tan2x = Math.abs(hit.normal.normal[1]);
            const tan2y = Math.abs(hit.normal.normal[2]);
            const tan2z = Math.abs(hit.normal.normal[0]);
            for (let i = 0; i < 2; ++i) {
                const g = new LineGizmo();
                g.points.push(vec3.fromValues(bx, by, bz));
                g.points.push(vec3.fromValues(bx + tan1x, by + tan1y, bz + tan1z));
                g.points.push(vec3.fromValues(bx + tan1x + tan2x, by + tan1y + tan2y, bz + tan1z + tan2z));
                g.points.push(vec3.fromValues(bx + tan2x, by + tan2y, bz + tan2z));
                g.closed = true;
                vec4.set(g.color, i, i, i, 1);
                g.style = LineStyle.SOLID;
                gizmos.push(g);
            }
            return gizmos;
        } else {
            return [];
        }
    }

    startStroke(input: PointerInput): [Stroke, Workspace] | null
    {
        const {state} = input;
        const hit = rayTraceWithFloor(
            state.workspace.work,
            input.rayStart,
            input.rayEnd,
        );

        if (!hit || !hit.normal) {
            return null;
        }

        const [history, edit] = state.workspace.history.beginEdit(state.workspace.work);
        edit.name = 'Attach Voxels';

        const stroke: Stroke = {
            move: input => AttachEditTool.apply(input, hit, edit),
            end: state => ({
                ...state.workspace,
                history: state.workspace!.history.endEdit(
                    state.workspace.work,
                    edit,
                ),
            }),
        };

        return [stroke, stroke.move({
            ...input,
            state: {
                ...input.state,
                workspace: {
                    ...input.state.workspace,
                    history,
                }
            },
        })];
    }

    private static apply(input: PointerInput, plane: RaytraceHit, edit: Edit): Workspace
    {
        const {state} = input;
        const data = state.workspace.work.data.expectData();

        // Ray trace, but constrained to the initial plane
        const normal = plane.normal!.normal;
        const dist = vec3.dot(plane.position, normal);
        const rayStartDist = vec3.dot(input.rayStart, normal);
        const rayEndDist = vec3.dot(input.rayEnd, normal);
        const t = (dist - rayStartDist) / (rayEndDist - rayStartDist);
        if (!(t > 0)) {
            // No intersection
            return state.workspace;
        }

        const pos = vec3.create();
        vec3.scale(pos, input.rayStart, 1 - t);
        vec3.scaleAndAdd(pos, pos, input.rayEnd, t);

        for (let i = 0; i < 3; ++i) {
            pos[i] = normal[i] != 0 ? plane.voxel[i] + normal[i] : Math.floor(pos[i]);
        }

        // Check bounds
        const {extents} = state.workspace.work.props;
        for (let i = 0; i < 3; ++i) {
            if (pos[i] < 1 || pos[i] > extents[i]) {
                return state.workspace;
            }
        }

        // Locate a voxel to attach the new voxel to
        const base = vec3.create();
        vec3.sub(base, pos, normal);
        if (base[1] > 0 && data.density[data.mapIndex(base[0], base[1], base[2])] < 128) {
            // Such a voxel does not exist
            return state.workspace;
        }

        // Do not overwrite
        const index = data.mapIndex(pos[0], pos[1], pos[2]);
        if (data.density[index] >= 128) {
            return state.workspace;
        }

        // Mutate the data
        const boundsMin = pos;
        const boundsMax = vec3.fromValues(pos[0] + 1, pos[1] + 1, pos[2] + 1);
        edit.saveOriginal(state.workspace.work, boundsMin, boundsMax);

        return {
            ...state.workspace,
            work: {
                ...state.workspace.work,
                data: state.workspace.work.data.mutate(context => {
                    const {data} = context;
                    data.density[index] = 255;
                    data.material[index] = editorStateMaterial(state);
                    context.markDirty(boundsMin, boundsMax);
                }),
            },
        }
    }
}

export const EDIT_TOOLS = {
    'attach': new AttachEditTool(),
};
