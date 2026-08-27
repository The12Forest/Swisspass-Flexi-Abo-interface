import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Makes an HTTP GET request using curl, which has a proper TLS fingerprint
 * that Cloudflare does not block (unlike Node.js built-in fetch).
 *
 * @param {string} url
 * @param {Object} headers - key/value header map
 * @returns {Promise<{ status: number, headers: Object, body: string }>}
 */
async function curlFetch(url, headers = {}) {
    const args = [
        '--silent',
        '--compressed',          // handle gzip/brotli automatically
        '--location',            // follow redirects
        '--write-out', '\n__STATUS__%{http_code}',   // append status at end
        '--tlsv1.2',
        '--tls-max', '1.3',
        // Mimic Firefox cipher suite ordering
        '--ciphers', 'TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384:ECDH+AESGCM:ECDH+CHACHA20:DHE+AESGCM',
    ];

    // Add all headers
    for (const [key, value] of Object.entries(headers)) {
        args.push('-H', `${key}: ${value}`);
    }

    args.push(url);

    const { stdout, stderr } = await execFileAsync('curl', args, {
        maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // Parse status from end of output
    const statusMatch = stdout.match(/\n__STATUS__(\d+)$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const body = statusMatch ? stdout.slice(0, -statusMatch[0].length) : stdout;

    return { status, body };
}

export { curlFetch };
