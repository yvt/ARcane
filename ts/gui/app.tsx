import * as React from 'react';
import bind from 'bind-decorator';

import { LogManager } from '../utils/logger';
import { Viewport, ViewportPersistent } from './viewport';
import { ViewportOverlay } from './viewportoverlay';

import { createEditorState, EditorState } from './editorstate';

const classNames = require('./app.less');

export interface AppProps
{
    logManager: LogManager;
}

interface State
{
    viewportPersistent: ViewportPersistent;
    editorState: EditorState;
}

export class App extends React.Component<AppProps, State>
{
    constructor(props: AppProps)
    {
        super(props);

        this.state = {
            viewportPersistent: new ViewportPersistent(props.logManager),
            editorState: createEditorState(),
        };
    }

    @bind
    private handleEditorStateChange(newValue: EditorState): void
    {
        this.setState({
            editorState: newValue,
        });
    }

    render()
    {
        const {state, props} = this;
        return <div className={classNames.app}>
            <Viewport persistent={state.viewportPersistent} />
            <ViewportOverlay
                editorState={state.editorState}
                onChangeEditorState={this.handleEditorStateChange} />
        </div>;
    }
}
