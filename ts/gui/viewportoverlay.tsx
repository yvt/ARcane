import * as React from 'react';

const classNames = require('./viewport.less');

export interface ViewportOverlayProps
{
}

interface State
{
}

export class ViewportOverlay extends React.Component<ViewportOverlayProps, State>
{
    constructor(props: ViewportOverlayProps)
    {
        super(props);

        this.state = {};
    }
    render()
    {
        return <div className={classNames.wrapper}>
        </div>;
    }
}
