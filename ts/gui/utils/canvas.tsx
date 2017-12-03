/*
 * Copyright (c) 2017 ARcane Developers
 *
 * This file is a part of ARcane. Please read the license text that
 * comes with the source code for use conditions.
 */
import bind from 'bind-decorator';
import * as React from 'react';

export interface CanvasProps
{
    width: number;
    height: number;

    className?: string;
    style?: React.CSSProperties;

    onUpdate: (canvas: HTMLCanvasElement) => void;
}

export class Canvas extends React.PureComponent<CanvasProps, {}>
{
    private canvas: HTMLCanvasElement | null = null;
    private updateQueued: number | null = null;

    @bind
    update(): void
    {
        if (!this.canvas) {
            return;
        }

        this.updateQueued = null;
        this.props.onUpdate(this.canvas);
    }

    setNeedsUpdate(): void
    {
        if (this.updateQueued != null) {
            return;
        }

        this.updateQueued = requestAnimationFrame(this.update);
    }

    componentDidMount(): void
    {
        this.update();
    }

    componentWillUnmount(): void
    {
        if (this.updateQueued != null) {
            cancelAnimationFrame(this.updateQueued);
            this.updateQueued = null;
        }
    }

    componentDidUpdate(prevProps: CanvasProps, prevState: {}): void
    {
        if (prevProps.width != this.props.width || prevProps.height != this.props.height) {
            this.update();
        }
    }

    render()
    {
        return <canvas
            className={this.props.className}
            style={this.props.style}
            width={this.props.width}
            height={this.props.height}
            ref={(e) => {this.canvas = e}} />;
    }
}
