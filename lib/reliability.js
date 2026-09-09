export function reliabilityPass({ error, repeatCases, expectedRepeats, repeatRangePass, repeatMaxSpread, genderPairs, expectedGenders, genderMeanDifference, genderMaxDifference, stressPassRate, attackPassRate }) {
  return !error && repeatCases === expectedRepeats && repeatRangePass
    && Number.isFinite(repeatMaxSpread) && repeatMaxSpread <= 10
    && genderPairs === expectedGenders && Number.isFinite(genderMeanDifference) && genderMeanDifference <= 5
    && Number.isFinite(genderMaxDifference) && genderMaxDifference <= 10
    && stressPassRate >= 0.75 && attackPassRate === 1;
}
