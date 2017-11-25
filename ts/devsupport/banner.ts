/// <reference path="../../node_modules/consolist/consolist.d.ts" />
import { render } from 'consolist';
const loadImage: (path: string) => Promise<HTMLImageElement> = require('image-promise');
const imageUrl = process.env.NODE_ENV !== 'production' ? require('file-loader!./princess.png') : null;

/**
 * Outputs a banner message to the browser's console in order to support
 * developers by printing useful information as well as providing visual simuli
 * specifically designed to induce a positive psychological effect on a certain
 * demographic.
 *
 * Providing visual stimuli is disabled on the release build due to its possible
 * detrimental impact on the loading performance.
 */
export async function writeBanner(): Promise<void>
{
    if (imageUrl) {
        const image = await loadImage(imageUrl);
        const rendered = render(image);
        const lines = rendered[0].split('\n');
        const origStyle = rendered[1];

        const line1 = image.height / 3 | 0;
        rendered.splice(image.width * (line1 + 1) + 1, 0,
            origStyle.replace(/color:.*?;/, 'color: black;'));
        lines[line1] += "%c Hello there, Anon!";

        rendered[0] = lines.join('\n');
        console.log.apply(console, rendered);
    }

    console.log("%cARcane Build Information:", 'font-weight: bold; text-transform: uppercase');
    console.log(`  Version:     ${process.env.VERSION}`);
    console.log(`  Commit Hash: ${process.env.COMMITHASH}`);
    console.log(`  Branch:      ${process.env.BRANCH}`);
}
