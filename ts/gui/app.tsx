import * as React from 'react';

import { LogManager } from '../utils/logger';
import { Viewport, ViewportPersistent } from './viewport';
import { ViewportOverlay } from './viewportoverlay';

export interface AppProps
{
    logManager: LogManager;
}

interface State
{
    viewportPersistent: ViewportPersistent;
}

export class App extends React.Component<AppProps, State>
{
    constructor(props: AppProps)
    {
        super(props);

        this.state = {
            viewportPersistent: new ViewportPersistent(props.logManager),
        };
    }
    render()
    {
        return <div>
            <Viewport persistent={this.state.viewportPersistent} />
            <ViewportOverlay />
        </div>;
    }
}
