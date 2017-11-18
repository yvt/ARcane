import * as React from 'react';

export interface RequestAnimationFrameProps
{
    disabled?: boolean;
    onUpdate: () => void;
}

/**
 * DOM-less component that generates animation frame events.
 */
export class RequestAnimationFrame extends React.PureComponent<RequestAnimationFrameProps, {}>
{
    /** Indicates whether there is an unresolved `requestAnimationFrame` callback. */
    private pending = false;

    private active = false;

    constructor(props: RequestAnimationFrameProps)
    {
        super(props);

        this.update = this.update.bind(this);
    }

    componentDidMount(): void
    {
        this.active = !this.props.disabled;
        this.start();
    }

    componentWillUnmount(): void
    {
         this.active = false;
    }

    componentDidUpdate(prevProps: RequestAnimationFrameProps, prevState: {}): void
    {
        this.active = !this.props.disabled;
        this.start();
    }

    private start(): void
    {
        if (this.pending || !this.active) {
            return;
        }
        this.pending = true;
        requestAnimationFrame(this.update);
    }

    private update(): void
    {
        if (!this.active) {
            this.pending = false;
            return;
        }
        requestAnimationFrame(this.update);
        this.props.onUpdate();
    }

    render()
    {
        return null;
    }
}
