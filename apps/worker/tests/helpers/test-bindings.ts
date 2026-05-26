/**
 * Re-export of the canonical test-bindings helper from
 * `@mizan/shared/testing`. The shape of stub bindings is identical for
 * apps/worker tests and packages/eval; consolidating in shared/testing
 * means one source of truth — see Pass 8 maintainability finding #15.
 */
export { makeStubBindings } from "@mizan/shared/testing";
