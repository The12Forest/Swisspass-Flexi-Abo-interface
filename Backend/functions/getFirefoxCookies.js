import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

/**
 * Finds the most recently used Firefox profile directory.
 */
function findFirefoxProfile() {
    // Firefox can live in different places depending on the distro
    const candidates = [
        path.join(os.homedir(), '.mozilla', 'firefox'),
        path.join(os.homedir(), '.config', 'mozilla', 'firefox'),
        path.join(os.homedir(), 'snap', 'firefox', 'common', '.mozilla', 'firefox'),
    ];

    const firefoxBase = candidates.find(p => fs.existsSync(p));
    if (!firefoxBase) {
        throw new Error(`Firefox profile directory not found. Checked:\n  ${candidates.join('\n  ')}`);
    }

    // Read profiles.ini to find the default profile
    const profilesIni = path.join(firefoxBase, 'profiles.ini');
    if (fs.existsSync(profilesIni)) {
        const ini = fs.readFileSync(profilesIni, 'utf8');
        // Find the profile marked as Default=1
        const sections = ini.split(/\[Profile\d+\]/);
        for (const section of sections) {
            if (section.includes('Default=1') || section.includes('Default=default')) {
                const pathMatch = section.match(/^Path=(.+)$/m);
                if (pathMatch) {
                    const isRelative = section.includes('IsRelative=1');
                    const profilePath = isRelative
                        ? path.join(firefoxBase, pathMatch[1].trim())
                        : pathMatch[1].trim();
                    if (fs.existsSync(profilePath)) return profilePath;
                }
            }
        }
    }

    // Fallback: pick the first .default-release profile
    const entries = fs.readdirSync(firefoxBase);
    for (const entry of entries) {
        if (entry.endsWith('.default-release') || entry.endsWith('.default')) {
            const full = path.join(firefoxBase, entry);
            if (fs.statSync(full).isDirectory()) return full;
        }
    }

    throw new Error('Could not locate a Firefox profile directory.');
}

/**
 * Reads cookies for a given hostname from Firefox's cookie store.
 * Returns an object of { cookieName: cookieValue }.
 *
 * @param {string} host - e.g. 'swisspass.ch'
 * @param {string[]} names - cookie names to extract, e.g. ['cf_clearance', '__cf_bm']
 */
function getFirefoxCookies(host, names = []) {
    const profileDir = findFirefoxProfile();
    const cookiesDb = path.join(profileDir, 'cookies.sqlite');

    if (!fs.existsSync(cookiesDb)) {
        throw new Error('Firefox cookies.sqlite not found at ' + cookiesDb);
    }

    // Firefox may have the file locked — copy it to /tmp first
    const tmpDb = path.join(os.tmpdir(), `ff_cookies_${Date.now()}.sqlite`);
    fs.copyFileSync(cookiesDb, tmpDb);

    try {
        const db = new Database(tmpDb, { readonly: true, fileMustExist: true });

        let query = `SELECT name, value FROM moz_cookies WHERE host LIKE ?`;
        const params = [`%${host}`];

        if (names.length > 0) {
            query += ` AND name IN (${names.map(() => '?').join(',')})`;
            params.push(...names);
        }

        const rows = db.prepare(query).all(...params);
        db.close();

        const result = {};
        for (const row of rows) {
            result[row.name] = row.value;
        }
        return result;
    } finally {
        try { fs.unlinkSync(tmpDb); } catch {}
    }
}

export { getFirefoxCookies };
