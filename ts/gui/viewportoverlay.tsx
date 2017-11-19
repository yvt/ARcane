import * as React from 'react';

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

export class ViewportOverlay extends React.Component<ViewportOverlayProps, State>
{
    constructor(props: ViewportOverlayProps)
    {
        super(props);

        this.state = {};

        this.handleDisplayModeChange = this.handleDisplayModeChange.bind(this);
    }

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
        </div>;
    }
}
