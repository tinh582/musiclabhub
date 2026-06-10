export function evaluateClassifications(actualLabels, predictedLabels, labels) {
  const total = Math.min(actualLabels.length, predictedLabels.length);
  const confusion = Object.fromEntries(labels.map((actual) => [
    actual,
    Object.fromEntries(labels.map((predicted) => [predicted, 0])),
  ]));

  let correct = 0;
  for (let index = 0; index < total; index += 1) {
    const actual = actualLabels[index];
    const predicted = predictedLabels[index];
    if (!confusion[actual] || confusion[actual][predicted] === undefined) continue;
    confusion[actual][predicted] += 1;
    if (actual === predicted) correct += 1;
  }

  const perLabel = labels.map((label) => {
    const truePositive = confusion[label][label];
    const falseNegative = labels.reduce((sum, predicted) => sum + confusion[label][predicted], 0) - truePositive;
    const falsePositive = labels.reduce((sum, actual) => sum + confusion[actual][label], 0) - truePositive;
    const precision = truePositive / Math.max(1, truePositive + falsePositive);
    const recall = truePositive / Math.max(1, truePositive + falseNegative);
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { label, precision, recall, f1, support: truePositive + falseNegative };
  });

  return {
    total,
    correct,
    accuracy: correct / Math.max(1, total),
    macroF1: perLabel.reduce((sum, metric) => sum + metric.f1, 0) / Math.max(1, perLabel.length),
    perLabel,
    confusion,
  };
}
