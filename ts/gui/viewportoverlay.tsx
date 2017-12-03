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

import { EditorState, DisplayMode } from './editorstate';
import { UIColor } from './utils/color';
import { PopupFrame } from './utils/popup';

const classNames = require('./viewportoverlay.less');

export interface ViewportOverlayProps
{
    editorState: EditorState;

    onChangeEditorState: (newValue: EditorState) => void;
}

interface State
{
    colorPopupActive: boolean;
}

const DISPLAY_MODE_LIST = [{
    value: DisplayMode.Normal,
    label: <span>Normal</span>,
}, {
    value: DisplayMode.AR,
    label: <span>AR</span>,
}, ];

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
    constructor(props: ViewportOverlayProps)
    {
        super(props);

        this.state = {
            colorPopupActive: false,
        };
    }

    @bind
    private handleDisplayModeChange(newValue: DisplayMode): void
    {
        this.props.onChangeEditorState({
            ... this.props.editorState,
            displayMode: newValue,
        });
    }

    @bind
    private handleActiveColorChange(newValue: UIColor): void
    {
        this.props.onChangeEditorState({
            ... this.props.editorState,
            activeColor: newValue,
        });
    }

    @bind
    private handleShowColorPopup(): void { this.setState({ colorPopupActive: true }); }

    @bind
    private handleDismissColorPopup(): void { this.setState({ colorPopupActive: false }); }

    render()
    {
        const {props, state} = this;
        const {editorState} = props;

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
            </div>
            <DisplayModeRadioList
                className={classNames.displayModeList}
                items={DISPLAY_MODE_LIST}
                value={editorState.displayMode}
                onChange={this.handleDisplayModeChange}
                />
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
