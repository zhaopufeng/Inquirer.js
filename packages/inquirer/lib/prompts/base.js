'use strict';
/**
 * Base prompt implementation
 * Should be extended by prompt types.
 */
const _ = {
  assign: require('lodash/assign'),
  defaults: require('lodash/defaults'),
  clone: require('lodash/clone'),
};
const chalk = require('chalk');
const runAsync = require('run-async');
const { filter, flatMap, share, take, takeUntil } = require('rxjs/operators');
const Choices = require('../objects/choices');
const ScreenManager = require('../utils/screen-manager');

class Prompt {
  constructor(question, rl, answers) {
    // Setup instance defaults property
    _.assign(this, {
      answers,
      status: 'pending',
    });

    // Set defaults prompt options
    this.opt = _.defaults(_.clone(question), {
      validate: () => true,
      validatingText: '',
      filter: (val) => val,
      filteringText: '',
      when: () => true,
      suffix: '',
      prefix: chalk.green('?'),
    });

    // Make sure name is present
    if (!this.opt.name) {
      this.throwParamError('name');
    }

    // Set default message if no message defined
    if (!this.opt.message) {
      this.opt.message = this.opt.name + ':';
    }

    // Normalize choices
    if (Array.isArray(this.opt.choices)) {
      this.opt.choices = new Choices(this.opt.choices, answers);
    }

    this.rl = rl;
    this.screen = new ScreenManager(this.rl);
  }

  /**
   * Start the Inquiry session and manage output value filtering
   * @return {Promise}
   */

  run() {
    return new Promise((resolve, reject) => {
      this._run(
        (value) => resolve(value),
        (error) => reject(error)
      );
    });
  }

  // Default noop (this one should be overwritten in prompts)
  _run(cb) {
    cb();
  }

  /**
   * Throw an error telling a required parameter is missing
   * @param  {String} name Name of the missing param
   * @return {Throw Error}
   */

  throwParamError(name) {
    throw new Error('You must provide a `' + name + '` parameter');
  }

  /**
   * Called when the UI closes. Override to do any specific cleanup necessary
   */
  close() {
    this.screen.releaseCursor();
  }

  /**
   * Run the provided validation method each time a submit event occur.
   * @param  {Rx.Observable} submit - submit event flow
   * @return {Object}        Object containing two observables: `success` and `error`
   */
  handleSubmitEvents(submit) {
    const self = this;
    const validate = runAsync(this.opt.validate);
    const asyncFilter = runAsync(this.opt.filter);
    const validation = submit.pipe(
      flatMap((value) => {
        this.startSpinner(value, this.opt.filteringText);
        return asyncFilter(value, self.answers).then(
          (filteredValue) => {
            this.startSpinner(filteredValue, this.opt.validatingText);
            return validate(filteredValue, self.answers).then(
              (isValid) => ({ isValid, value: filteredValue }),
              (err) => ({ isValid: err, value: filteredValue })
            );
          },
          (err) => ({ isValid: err })
        );
      }),
      share()
    );

    const success = validation.pipe(
      filter((state) => state.isValid === true),
      take(1)
    );
    const error = validation.pipe(
      filter((state) => state.isValid !== true),
      takeUntil(success)
    );

    return {
      success,
      error,
    };
  }

  startSpinner(value, bottomContent) {
    // If the question will spin, cut off the prefix (for layout purposes)
    const content = bottomContent
      ? this.getQuestion() + value
      : this.getQuestion().slice(this.opt.prefix.length + 1) + value;

    this.screen.renderWithSpinner(content, bottomContent);
  }

  /**
   * Generate the prompt question string
   * @return {String} prompt question string
   */
  getQuestion() {
    let message =
      this.opt.prefix +
      ' ' +
      chalk.bold(this.opt.message) +
      this.opt.suffix +
      chalk.reset(' ');

    // Append the default if available, and if question isn't answered
    if (this.opt.default != null && this.status !== 'answered') {
      // If default password is supplied, hide it
      if (this.opt.type === 'password') {
        message += chalk.italic.dim('[hidden] ');
      } else {
        message += chalk.dim('(' + this.opt.default + ') ');
      }
    }

    return message;
  }
}

module.exports = Prompt;
