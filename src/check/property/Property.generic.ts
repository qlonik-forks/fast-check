import { Random } from '../../random/generator/Random';
import { Arbitrary } from '../arbitrary/definition/Arbitrary';
import { Shrinkable } from '../arbitrary/definition/Shrinkable';
import { PreconditionFailure } from '../precondition/PreconditionFailure';
import { IRawProperty, runIdToFrequency } from './IRawProperty';
import { readConfigureGlobal, GlobalPropertyHookFunction } from '../runner/configuration/GlobalParameters';
import { ConverterFromNext } from '../arbitrary/definition/ConverterFromNext';

/**
 * Type of legal hook function that can be used to call `beforeEach` or `afterEach`
 * on a {@link IPropertyWithHooks}
 *
 * @remarks Since 2.2.0
 * @public
 */
export type PropertyHookFunction = (globalHookFunction: GlobalPropertyHookFunction) => void;

/**
 * Interface for synchronous property, see {@link IRawProperty}
 * @remarks Since 1.19.0
 * @public
 */
export interface IProperty<Ts> extends IRawProperty<Ts, false> {}

/**
 * Interface for synchronous property defining hooks, see {@link IProperty}
 * @remarks Since 2.2.0
 * @public
 */
export interface IPropertyWithHooks<Ts> extends IProperty<Ts> {
  /**
   * Define a function that should be called before all calls to the predicate
   * @param invalidHookFunction - Function to be called, please provide a valid hook function
   * @remarks Since 1.6.0
   */
  beforeEach(
    invalidHookFunction: (hookFunction: GlobalPropertyHookFunction) => Promise<unknown>
  ): 'beforeEach expects a synchronous function but was given a function returning a Promise';

  /**
   * Define a function that should be called before all calls to the predicate
   * @param hookFunction - Function to be called
   * @remarks Since 1.6.0
   */
  beforeEach(hookFunction: PropertyHookFunction): IPropertyWithHooks<Ts>;

  /**
   * Define a function that should be called after all calls to the predicate
   * @param invalidHookFunction - Function to be called, please provide a valid hook function
   * @remarks Since 1.6.0
   */
  afterEach(
    invalidHookFunction: (hookFunction: GlobalPropertyHookFunction) => Promise<unknown>
  ): 'afterEach expects a synchronous function but was given a function returning a Promise';
  /**
   * Define a function that should be called after all calls to the predicate
   * @param hookFunction - Function to be called
   * @remarks Since 1.6.0
   */
  afterEach(hookFunction: PropertyHookFunction): IPropertyWithHooks<Ts>;
}

/**
 * Property, see {@link IProperty}
 *
 * Prefer using {@link property} instead
 *
 * @internal
 */
export class Property<Ts> implements IProperty<Ts>, IPropertyWithHooks<Ts> {
  // Default hook is a no-op
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  static dummyHook: GlobalPropertyHookFunction = () => {};
  private beforeEachHook: GlobalPropertyHookFunction;
  private afterEachHook: GlobalPropertyHookFunction;
  constructor(readonly arb: Arbitrary<Ts>, readonly predicate: (t: Ts) => boolean | void) {
    const {
      beforeEach = Property.dummyHook,
      afterEach = Property.dummyHook,
      asyncBeforeEach,
      asyncAfterEach,
    } = readConfigureGlobal() || {};

    if (asyncBeforeEach !== undefined) {
      throw Error('"asyncBeforeEach" can\'t be set when running synchronous properties');
    }

    if (asyncAfterEach !== undefined) {
      throw Error('"asyncAfterEach" can\'t be set when running synchronous properties');
    }

    this.beforeEachHook = beforeEach;
    this.afterEachHook = afterEach;
  }
  isAsync = () => false as const;
  generate(mrng: Random, runId?: number): Shrinkable<Ts> {
    if (ConverterFromNext.isConverterFromNext(this.arb)) {
      return this.arb.toShrinkable(this.arb.arb.generate(mrng, runId != null ? runIdToFrequency(runId) : undefined));
    }
    return runId != null ? this.arb.withBias(runIdToFrequency(runId)).generate(mrng) : this.arb.generate(mrng);
  }
  run(v: Ts): PreconditionFailure | string | null {
    this.beforeEachHook();
    try {
      const output = this.predicate(v);
      return output == null || output === true ? null : 'Property failed by returning false';
    } catch (err) {
      // precondition failure considered as success for the first version
      if (PreconditionFailure.isFailure(err)) return err;
      // exception as string in case of real failure
      if (err instanceof Error && err.stack) return `${err}\n\nStack trace: ${err.stack}`;
      return `${err}`;
    } finally {
      this.afterEachHook();
    }
  }

  beforeEach(invalidHookFunction: (hookFunction: GlobalPropertyHookFunction) => Promise<unknown>): never;
  beforeEach(validHookFunction: PropertyHookFunction): Property<Ts>;
  beforeEach(hookFunction: PropertyHookFunction): unknown {
    const previousBeforeEachHook = this.beforeEachHook;
    this.beforeEachHook = () => hookFunction(previousBeforeEachHook);
    return this;
  }

  afterEach(invalidHookFunction: (hookFunction: GlobalPropertyHookFunction) => Promise<unknown>): never;
  afterEach(hookFunction: PropertyHookFunction): Property<Ts>;
  afterEach(hookFunction: PropertyHookFunction): unknown {
    const previousAfterEachHook = this.afterEachHook;
    this.afterEachHook = () => hookFunction(previousAfterEachHook);
    return this;
  }
}
