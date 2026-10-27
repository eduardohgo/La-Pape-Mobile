// Keep machine-readable evidence without third-party coverage dependencies.
module.exports = async function* coverageReporter(source) {
  for await (const event of source) {
    if (['test:coverage', 'test:summary', 'test:fail'].includes(event.type)) {
      yield JSON.stringify(event) + '\n';
    }
  }
};
