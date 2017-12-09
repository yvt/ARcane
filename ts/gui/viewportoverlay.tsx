/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from 'react';
import bind from 'bind-decorator';

import { RadioList } from './controls/radiolist';
import { ColorPicker } from './controls/colorpicker';
import { PureCssPie } from './controls/purecsspie';
import { Slider } from './controls/slider';
import { EventIndicator } from './eventindicator';

import { EditorState, DisplayMode } from './editorstate';
import { UIColor } from './utils/color';
import { PopupFrame } from './utils/popup';

const classNames = require('./viewportoverlay.less');
const radioListClassNames = require('./controls/radiolist_styles.less');

export interface ViewportOverlayProps
{
    editorState: EditorState;

    onChangeEditorState: (reducer: (old: EditorState) => EditorState) => void;
}

interface State
{
    colorPopupActive: boolean;
    roughnessPopupActive: boolean;
    materialPopupActive: boolean;
}

const DISPLAY_MODE_LIST = [{
    value: DisplayMode.Normal,
    label: <span>Normal</span>,
}, {
    value: DisplayMode.AR,
    label: <span>AR</span>,
}, ];

const MATERIAL_LIST = [{
    value: 0,
    label: 'Dielectric',
}, {
    value: 1,
    label: 'Metal',
}]

const MOUSE_HELP = <tbody>
    <tr>
        <th>LMB</th>
        <td>Use the active tool</td>
    </tr>
    <tr>
        <th>RMB</th>
        <td>Rotate</td>
    </tr>
    <tr>
        <th>Shift + RMB</th>
        <td>Pan</td>
    </tr>
    <tr>
        <th>Mouse Wheel</th>
        <td>Zoom</td>
    </tr>
</tbody>;

export class ViewportOverlay extends React.Component<ViewportOverlayProps, State>
{
    private eventIndicator: EventIndicator | null = null;

    constructor(props: ViewportOverlayProps)
    {
        super(props);

        this.state = {
            colorPopupActive: false,
            roughnessPopupActive: false,
            materialPopupActive: false,
        };
    }

    @bind
    private handleDisplayModeChange(newValue: DisplayMode): void
    {
        this.props.onChangeEditorState(state => ({
            ... state,
            displayMode: newValue,
        }));
    }

    @bind
    private handleActiveColorChange(newValue: UIColor): void
    {
        this.props.onChangeEditorState(state => ({
            ... state,
            activeColor: newValue,
        }));
    }

    @bind
    private handleActiveMaterialChange(newValue: number): void
    {
        this.props.onChangeEditorState(state => ({
            ... state,
            activeMaterial: newValue,
        }));
    }

    @bind
    private handleActiveRoughnessChange(newValue: number): void
    {
        this.props.onChangeEditorState(state => ({
            ... state,
            activeRoughness: Math.round(newValue * 63),
        }));
    }

    @bind
    private handleShowColorPopup(): void { this.setState({ colorPopupActive: true }); }

    @bind
    private handleDismissColorPopup(): void { this.setState({ colorPopupActive: false }); }

    @bind
    private handleShowRoughnessPopup(): void { this.setState({ roughnessPopupActive: true }); }

    @bind
    private handleDismissRoughnessPopup(): void { this.setState({ roughnessPopupActive: false }); }

    @bind
    private handleShowMaterialPopup(): void { this.setState({ materialPopupActive: true }); }

    @bind
    private handleDismissMaterialPopup(): void { this.setState({ materialPopupActive: false }); }

    @bind
    private handleUndo(): void { this.handleUndoRedo('undo'); }

    @bind
    private handleRedo(): void { this.handleUndoRedo('redo'); }

    private handleUndoRedo(dir: 'undo' | 'redo'): void
    {
        this.props.onChangeEditorState(state => {
            if (!state.workspace ||
                !(dir == 'undo'
                    ? state.workspace.history.canUndo
                    : state.workspace.history.canRedo)) {
                return state;
            }
            const {workspace} = state;
            const [work, actionName, history] = workspace.history[dir](workspace.work);

            this.eventIndicator!.display(`${dir === 'undo' ? 'Undo' : 'Redo'} ${actionName}`);

            return {
                ... state,
                workspace: {
                    ...state.workspace,
                    history,
                    work,
                },
            }
        });
    }

    render()
    {
        const {props, state} = this;
        const {editorState} = props;

        const NumberRadioList: new() => RadioList<number> = RadioList as any;
        const DisplayModeRadioList: new() => RadioList<DisplayMode> = RadioList as any;

        return <div className={classNames.wrapper}>
            <div className={classNames.toolbar}>
                <input
                    id='toolbar-color'
                    type='checkbox'
                    onChange={this.handleShowColorPopup}
                    checked={state.colorPopupActive} />
                <label htmlFor='toolbar-color'>
                    <i style={{backgroundColor: editorState.activeColor.toRgb().toCss()}} />
                </label>
                <div className={classNames.colorPopup}>
                    <PopupFrame
                        active={state.colorPopupActive}
                        onDismiss={this.handleDismissColorPopup}>
                        <ColorPicker
                            value={props.editorState.activeColor}
                            onChange={this.handleActiveColorChange}
                            />
                    </PopupFrame>
                </div>

                <input
                    id='toolbar-roughness'
                    type='checkbox'
                    onChange={this.handleShowRoughnessPopup}
                    checked={state.roughnessPopupActive} />
                <label htmlFor='toolbar-roughness' className={classNames.toolbarRoughness}>
                    <span>
                        <PureCssPie value={(editorState.activeRoughness + 1) / 64} />
                    </span>
                </label>
                <div className={classNames.roughnessPopup}>
                    <PopupFrame
                        active={state.roughnessPopupActive}
                        onDismiss={this.handleDismissRoughnessPopup}>
                        <label>Roughness</label>
                        <Slider
                            value={editorState.activeRoughness / 63}
                            onChange={this.handleActiveRoughnessChange}
                            />
                    </PopupFrame>
                </div>

                <input
                    id='toolbar-material'
                    type='checkbox'
                    onChange={this.handleShowMaterialPopup}
                    checked={state.materialPopupActive} />
                <label htmlFor='toolbar-material' className={classNames.toolbarMaterial}>
                    <span className={[
                        classNames.toolbarMaterialDielectric,
                        classNames.toolbarMaterialMetal,
                    ][editorState.activeMaterial]} />
                </label>
                <div className={classNames.materialPopup}>
                    <PopupFrame
                        active={state.materialPopupActive}
                        onDismiss={this.handleDismissMaterialPopup}>
                        <NumberRadioList
                            items={MATERIAL_LIST}
                            className={radioListClassNames.buttonsHorizontal}
                            value={editorState.activeMaterial}
                            onChange={this.handleActiveMaterialChange}
                            />
                    </PopupFrame>
                </div>
            </div>
            <div className={classNames.toolbar2}>
                <button type='button' onClick={this.handleUndo}
                    disabled={!(editorState.workspace &&
                        editorState.workspace.history.canUndo)}>Undo</button>
                <button type='button' onClick={this.handleRedo}
                    disabled={!(editorState.workspace &&
                        editorState.workspace.history.canRedo)}>Redo</button>
            </div>
            <DisplayModeRadioList
                className={classNames.displayModeList}
                items={DISPLAY_MODE_LIST}
                value={editorState.displayMode}
                onChange={this.handleDisplayModeChange}
                />
            <EventIndicator ref={e => {this.eventIndicator = e;}} />
            {
                !editorState.inputDevicesInUse.touch &&
                <table className={classNames.mouseHelp +
                   (editorState.viewportHot && editorState.inputDevicesInUse.mouse ?
                       ' ' + classNames.visible :
                       '')}>{MOUSE_HELP}</table>
            }
        </div>;
    }
}
