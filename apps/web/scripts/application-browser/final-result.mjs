// Preserve the result's own diagnostics. A verified receipt supersedes the
// driver's earlier waiting-for-receipt note; only the receipt path sets SUBMITTED.
export function finishBrowserResult(result, driver) {
  return {
    ...result,
    questions: driver?.questions ?? result.questions ?? [],
    unresolved: result.status === 'SUBMITTED' ? [] : (result.unresolved ?? driver?.unresolved ?? []),
  };
}
