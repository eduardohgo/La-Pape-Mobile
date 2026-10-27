// Synthetic, never executed. Independent examples for the six local rules.
function dynamicCode(input: string) { return eval(input); }
const insecureTls = { rejectUnauthorized: false };
function sql(req, db) { return db.query('SELECT * FROM demo WHERE id=' + req.query.id); }
function shell(req, childProcess) { return childProcess.exec('echo ' + req.body.command); }
function RawHtml({ html }) { return <div dangerouslySetInnerHTML={{ __html: html }} />; }
const sessionToken = Math.random();
