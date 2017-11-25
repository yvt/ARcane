/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from 'react';
import bind from 'bind-decorator';

import { RadioList } from './controls/radiolist';

import { EditorState, DisplayMode } from './editorstate';

const classNames = require('./viewportoverlay.less');

export interface ViewportOverlayProps
{
    editorState: EditorState;

    onChangeEditorState: (newValue: EditorState) => void;
}

interface State
{
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

        this.state = {};
    }

    @bind
    private handleDisplayModeChange(newValue: DisplayMode): void
    {
        this.props.onChangeEditorState({
            ... this.props.editorState,
            displayMode: newValue,
        });
    }

    render()
    {
        const {props} = this;
        const {editorState} = props;

        const DisplayModeRadioList: new() => RadioList<DisplayMode> = RadioList as any;

        return <div className={classNames.wrapper}>
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
