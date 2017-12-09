/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import * as React from 'react';
import bind from 'bind-decorator';

import { LogManager } from '../utils/logger';
import { Viewport } from './viewport';
import { ViewportPersistent } from './viewportpersistent';
import { ViewportOverlay } from './viewportoverlay';

import { createEditorState, EditorState } from './editorstate';
import { Work } from '../model/work';
import { EditHistoryState } from './edit';

import { LocalDataStorage } from '../storage/local';
import { LocalWork } from '../storage/localwork';

const classNames = require('./app.less');

export interface AppProps
{
    logManager: LogManager;
}

interface State
{
    fatalError: string | null;
    initializationStage: 'db' | 'load-work' | null;
    savingWork: Work | null;

    storage: LocalDataStorage | null;
    localWork: LocalWork | null;

    viewportPersistent: ViewportPersistent;
    editorState: EditorState;
}

export class App extends React.Component<AppProps, State>
{
    constructor(props: AppProps)
    {
        super(props);

        this.state = {
            fatalError: null,
            initializationStage: 'db',
            savingWork: null,

            storage: null,
            localWork: null,

            viewportPersistent: new ViewportPersistent(props.logManager),
            editorState: createEditorState(),
        };

        this.initialize().catch(error => {
            this.setState({
                fatalError: String(error),
            });
        });
    }

    private async initialize(): Promise<void>
    {
        let storage = await LocalDataStorage.instance;
        this.setState({
            initializationStage: 'load-work',
            storage,
        });

        // DEUBG: just use a pre-determined document name for now
        const localWork = await storage.works.open('default', false)
            .catch(() => storage.works.open('default', true));
        this.setState({
            initializationStage: null,
            localWork,
            editorState: {
                ...this.state.editorState,
                workspace: {
                    work: localWork.work,
                    history: EditHistoryState.createEmpty(),
                },
            },
        });
    }

    @bind
    private handleEditorStateChange(reducer: (old: EditorState) => EditorState): void
    {
        this.setState(state => {
            const newValue = reducer(state.editorState);

            // Save the changes
            if (
                newValue.workspace && state.editorState.workspace &&
                newValue.workspace.work !== state.editorState.workspace.work &&
                !newValue.workspace.history.isAnyEditActive
            ) {
                this.setState({
                    savingWork: newValue.workspace.work,
                });
                state.localWork!.update(newValue.workspace.work)
                    .then(() => {
                        this.setState((prevState: State) => {
                            if (prevState.savingWork === newValue.workspace!.work) {
                                return {
                                    savingWork: null,
                                };
                            } else {
                                return {};
                            }
                        });
                    });
            }

            return {
                editorState: newValue,
            };
        });
    }

    render()
    {
        const {state, props} = this;

        let stageName = null;
        switch (state.initializationStage) {
            case 'db':
                stageName = 'Reticulating bezier splines';
                break;
            case 'load-work':
                stageName = 'Loading the workspace';
                break;
        }

        return <div className={classNames.app}>
            <Viewport
                editorState={state.editorState}
                onChangeEditorState={this.handleEditorStateChange}
                persistent={state.viewportPersistent} />
            <ViewportOverlay
                editorState={state.editorState}
                onChangeEditorState={this.handleEditorStateChange} />
            {
                state.fatalError != null &&
                    <section className={classNames.error}>
                        <div>
                            <h1>Oops — Something Went Wrong</h1>
                            <p>
                                Try reloading the page. Your data should be safe.
                            </p>
                            <p>
                                {state.fatalError}
                            </p>
                        </div>
                    </section>
            }
            {
                state.fatalError == null && state.initializationStage != null &&
                    <section className={classNames.splash}>
                        <p>{stageName}</p>
                    </section>
            }
        </div>;
    }
}
