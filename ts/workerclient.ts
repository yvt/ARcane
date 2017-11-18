import { filterMap } from './utils/utils';
import { WorkerClient } from './utils/workerboot';

// Look for the `<script>` tag to find out the URL of this script
const scriptUrls = filterMap(
    document.getElementsByTagName('script'),
    (e) => {
        if (e.src.indexOf('bundle.js') >= 0) {
            return e.src;
        }
        return null;
    });

function getScriptUrl()
{
    // Defer the error (so the ES module is loaded cleanly and the error can be
    // handled by `try`/`catch`)
    if (scriptUrls.length != 1) {
        throw new Error(`Failed to determine the URL of the main script. Candidates: ${scriptUrls}`);
    }
    return scriptUrls[0];
}

export function createWorkerClient(): WorkerClient
{
    return new WorkerClient(new Worker(getScriptUrl()));
}
