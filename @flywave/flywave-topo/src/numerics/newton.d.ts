import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
/**
 * Base class for Newton iterations in various dimensions.
 * Dimension-specific classes carry all dimension-related data and answer generalized queries from this base class.
 * @internal
 */
export declare abstract class AbstractNewtonIterator {
    /** Compute a step. The current x and function values must be retained for use in later method calls. */
    abstract computeStep(): boolean;
    /**
     * Return the current step size, scaled for use in tolerance tests.
     * * This is a single number, typically the max of various per-dimension `dx/(1+x)` for the x and dx of that dimension.
     */
    abstract currentStepSize(): number;
    /**
     * Apply the current step (in all dimensions).
     * @param isFinalStep true if this is a final step.
     */
    abstract applyCurrentStep(isFinalStep: boolean): boolean;
    /**
     * The constructor.
     * @param stepSizeTarget tolerance to consider a single step converged.
     * This number should be "moderately" strict. Because 2 successive convergences are required,
     * it is expected that a first "accept" for (say) 10 to 14 digit step will be followed by another
     * iteration. A well behaved newton would then hypothetically double the number of digits to
     * 20 to 28. Since the IEEE double only carries 16 digits, this second-convergence step will
     * typically achieve full precision.
     * @param successiveConvergenceTarget number of successive convergences required for acceptance.
     * @param maxIterations max number of iterations. A typical newton step converges in 3 to 6 iterations.
     * Allow 15 to 20 to catch difficult cases.
     */
    protected constructor(stepSizeTolerance?: number, successiveConvergenceTarget?: number, maxIterations?: number);
    /** Number of consecutive steps which passed convergence condition. */
    protected _numAccepted: number;
    /** Target number of successive convergences. */
    protected _successiveConvergenceTarget: number;
    /** Convergence target (the implementation-specific currentStepSize is compared to this). */
    protected _stepSizeTolerance: number;
    /** Max iterations allowed. */
    protected _maxIterations: number;
    /** Number of iterations (incremented at each step). */
    numIterations: number;
    /**
     * Test if a step is converged.
     * * Convergence is accepted with enough (_successiveConvergenceTarget) small steps (according to _stepSizeTolerance)
     * occur in succession.
     * @param delta step size as reported by currentStepSize.
     */
    testConvergence(delta: number): boolean;
    /**
     * Run iterations, calling various methods from base and derived classes:
     * * computeStep -- typically evaluate derivatives and solve linear system.
     * * currentStepSize -- return numeric measure of the step just computed by computeStep.
     * * testConvergence -- test if the step from currentStepSize (along with recent steps) is converged.
     * * applyCurrentStep -- apply the step to the independent variables.
     */
    runIterations(): boolean;
}
/**
 * Object to evaluate a newton function. The object must retain most-recent function and derivative
 * values for immediate query.
 * @internal
 */
export declare abstract class NewtonEvaluatorRtoRD {
    /** Evaluate the function and its derivative at x. */
    abstract evaluate(x: number): boolean;
    /** Most recent function value, i.e., f(x_n). */
    currentF: number;
    /** Most recent evaluated derivative, i.e., f'(x_n). */
    currentdFdX: number;
}
/**
 * Newton iterator for use when both function and derivative can be evaluated.
 * To solve `f(x) = 0`, the Newton iteration is `x_{n+1} = x_n - dx = x_n - f(x_n)/f'(x_n)`.
 * To solve `f(x) = target` which is equivalent to solving  `g(x) = f(x) - target = 0`, the Newton iteration is
 * `x_{n+1} = x_n - dx = x_n - g(x_n)/g'(x_n) = x_n - (f(x_n)-target)/f'(x_n)`.
 * @internal
 */
export declare class Newton1dUnbounded extends AbstractNewtonIterator {
    private readonly _func;
    /** Current step is dx. */
    private _currentStep;
    /** Current X is x_n. */
    private _currentX;
    /** The target */
    private _target;
    /**
     * Constructor for 1D newton iteration with derivatives.
     * @param func function that returns both function value and derivative.
     */
    constructor(func: NewtonEvaluatorRtoRD);
    /** Set the independent variable, i.e., x_n. */
    setX(x: number): boolean;
    /** Get the independent variable, i.e., x_n. */
    getX(): number;
    /** Set the target function value. */
    setTarget(y: number): void;
    /** Move the current X by the just-computed step, i.e., `x_n - dx`. */
    applyCurrentStep(): boolean;
    /** Compute the univariate newton step. */
    computeStep(): boolean;
    /** Return the current step size as a relative number, i.e., `|dx / (1 + |x_n|)|`. */
    currentStepSize(): number;
}
/**
 * Object to evaluate a newton function (without derivative). The object must retain most-recent function value.
 * @internal
 */
export declare abstract class NewtonEvaluatorRtoR {
    /** Evaluate function value into member currentF */
    abstract evaluate(x: number): boolean;
    /** Most recent function evaluation, i.e., f(x_n). */
    currentF: number;
}
/**
 * Newton iteration for a univariate function, using approximate derivatives.
 * To approximate the derivatives we use a small step `h`, i.e., `f'(x_n) = (f(x_n + h) - f(x_n)) / h`.
 * Therefore, to solve `f(x) = 0`, the iteration is
 * `x_{n+1} = x_n - dx = x_n - f(x_n)/f'(x_n) = x_n - f(x_n) * h / (f(x_n + h) - f(x_n))`.
 * @internal
 */
export declare class Newton1dUnboundedApproximateDerivative extends AbstractNewtonIterator {
    private readonly _func;
    /** Current step is dx. */
    private _currentStep;
    /** Current X is x_n. */
    private _currentX;
    /**
     * Step size for approximate derivative for the iteration.
     * * Initialized to 1e-8, which is appropriate for iteration in fraction space.
     * * Should be larger for iteration with real distance as x.
     */
    derivativeH: number;
    /**
     * Constructor for 1D newton iteration with approximate derivatives.
     * @param func function that only returns function value (and not derivative).
     */
    constructor(func: NewtonEvaluatorRtoR);
    /** Set the independent variable, i.e., x_n. */
    setX(x: number): boolean;
    /** Get the independent variable, i.e., x_n. */
    getX(): number;
    /** Move the current X by the just-computed step, i.e., `x_n - dx`. */
    applyCurrentStep(): boolean;
    /** Univariate newton step computed with approximate derivative. */
    computeStep(): boolean;
    /** Return the current step size as a relative number, i.e., `|dx / (1 + |x_n|)|`. */
    currentStepSize(): number;
}
/**
 * Object to evaluate a 2-parameter newton function with derivatives.
 * @internal
 */
export declare abstract class NewtonEvaluatorRRtoRRD {
    /**
     * Iteration controller calls this to ask for evaluation of the function and its two partial derivatives.
     * * The implementation returns true, it must set the currentF object.
     */
    abstract evaluate(x: number, y: number): boolean;
    /**
     * Most recent function evaluation as parts of the plane.
     * * See doc of [[Newton2dUnboundedWithDerivative]] class for info on 2d newton method.
     * * For current value (u,v) of the independent variable, and `F(u,v) := (x(u,v), y(u,v)), the returned plane has:
     * * `origin.x` = x(u,v)
     * * `origin.y` = y(u,v)
     * * `vectorU.x` = dx/du
     * * `vectorU.y` = dy/du
     * * `vectorV.x` = dx/dv
     * * `vectorV.y` = dy/dv
     * * In other words, the plane stores the columns of the Jacobian matrix J of F: `vectorU` stores the partials
     * of F with respect to u (the first column of J), and `vectorV` stores the partials of F with respect to v
     * (the second column of J):
     *
     * `[vectorU.x   vectorV.x]`
     *
     * `[vectorU.y   vectorV.y]`
     */
    currentF: Plane3dByOriginAndVectors;
    /**
     * Constructor.
     * * This creates a currentF object to (repeatedly) receive function and derivatives.
     */
    constructor();
}
/**
 * Implement evaluation steps for newton iteration in 2 dimensions, using caller supplied NewtonEvaluatorRRtoRRD object.
 * * Suppose we want to find the roots of `F(u,v) := (x(u,v), y(u,v))`. Writing `X := (u,v)` and `F(X)` as column vectors,
 *  the 2D Newton's iteration to find a root of `F` is given by:
 * `X_{n+1} = X_n - dX = X_n - JInv(X_n)F(X_n)`, where `JInv` is the inverse of the Jacobian matrix `J`, and `J` is
 * defined as:
 *
 * `[dx/du   dx/dv]`
 *
 * `[dy/du   dy/dv]`
 * @internal
 */
export declare class Newton2dUnboundedWithDerivative extends AbstractNewtonIterator {
    private readonly _func;
    /** Current step, or dX = (du, dv). */
    private readonly _currentStep;
    /** Current uv parameters, or X_n = (u_n, v_n). */
    private readonly _currentUV;
    /**
     * Constructor for 2D newton iteration with derivatives.
     * @param func function that returns both function value and derivative.
     */
    constructor(func: NewtonEvaluatorRRtoRRD);
    /** Set the current uv parameters, i.e., `X_n = (u_n, v_n)`. */
    setUV(u: number, v: number): boolean;
    /** Get the current u parameter of X_n, i.e., u_n. */
    getU(): number;
    /** Get the current v parameter of X_n, i.e., v_n. */
    getV(): number;
    /** Update the current uv parameter by currentStep, i.e., compute `X_{n+1} := X_n - dX = (u_n - du, v_n - dv)`. */
    applyCurrentStep(): boolean;
    /**
     * Evaluate the functions and derivatives at `X_n = (u_n, v_n)`, and solve the Jacobian matrix equation to
     * compute `dX = (du, dv)`.
     */
    computeStep(): boolean;
    /**
     * Return the current relative step size, i.e., the larger absolute component of `dX / (1 + |X_n|)`
     */
    currentStepSize(): number;
}
/**
 * SimpleNewton has static methods for newton methods with evaluated functions presented as immediate arguments
 * (not function object).
 * @internal
 */
export declare class SimpleNewton {
    /**
     * Run a one-dimensional newton iteration with separate functions for function and derivative.
     * * Completion is at 2 (TWO) successive passes at `absoluteTolerance + relTol * abs(x)`, where relTol is
     * chosen internally.
     * * `absoluteTolerance` is usually aggressively tight -- should come into play only for x near zero.
     * * The `relTol` is fluffy (for instance around 1e-11) but in properly converging cases the extra pass after
     * first success normally moves to full machine precision.
     * * This is an open-loop newton -- it just runs, and returns undefined if anything bad happens.
     */
    static runNewton1D(x: number, func: (x: number) => number | undefined, derivative: (x: number) => number | undefined, absoluteTolerance?: number): number | undefined;
}
