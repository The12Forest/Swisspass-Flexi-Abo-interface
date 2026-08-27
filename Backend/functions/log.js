import fs from 'fs';
if (!fs.existsSync('./LOG')) fs.mkdirSync('./LOG');

export default (label) => {
    const lbl = (label + ":").slice(0, 15).padEnd(15);
    return (...args) => {
        const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
        const line = `${ts}    ${lbl} ${args.join(' ')}`;
        process.stdout.write(line + '\n');
        fs.appendFileSync(`./LOG/LOG_${ts.slice(0, 10)}.log`, line + '\n');
    };
};