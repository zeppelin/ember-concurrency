import Ember from 'ember';
import { isGeneratorIterator } from 'ember-concurrency/utils';
import { Arguments } from 'ember-concurrency/utils';

function GeneratorFunctionIterator(iter) {
  this.iter = iter;
}

GeneratorFunctionIterator.prototype.next = function(nextValue) {
  return this.iter.next(nextValue);
};

GeneratorFunctionIterator.prototype.return = function(returnValue) {
  return this.iter.return(returnValue);
};


function RegularFunctionIterator(value) {
  this.value = value;
  this.hasEmittedValue = false;
}

RegularFunctionIterator.prototype.next = function() {
  if (this.hasEmittedValue) {
    return {
      done: true,
      value: undefined,
    };
  } else {
    this.hasEmittedValue = true;
    return {
      done: true,
      value: this.value,
    };
  }
};

RegularFunctionIterator.prototype.return = function(value) {
  return this.next(value);
};

function ProxyIterator(iter) {
  this.iter = iter;
  this.returnValue = null;
}

ProxyIterator.prototype.next = function() {
  if (this.returnValue) { return this.returnValue; }

  let result = this.iter.next();
  if (result.done) {
    this.returnValue = result;
  }
  return result;
};

ProxyIterator.prototype.return = function(value) {
  if (!this.returnValue) {
    this.returnValue = { done: true, value: value };
  }

  return this.returnValue;
};

function _makeIteratorFromFunction(fn, context, args) {
  let value;

  if (args[0] instanceof Arguments) {
    value = fn.apply(context, args[0].args);
  } else {
    value = fn.apply(context, args);
  }

  if (isGeneratorIterator(value)) {
    return new GeneratorFunctionIterator(value);
  } else {
    return new RegularFunctionIterator(value);
  }
}

export function _makeIterator(iterable, owner, args) {
  if (typeof iterable.next === 'function') {
    return new ProxyIterator(iterable);
  } else if (typeof iterable === 'function') {
    return _makeIteratorFromFunction(iterable, owner, args);
  } else if (iterable[Symbol.iterator]) {
    return new ProxyIterator(iterable[Symbol.iterator]());
  } else if (typeof iterable.subscribe === 'function') {
    return createBufferedIterator(iterable);
  } else {
    // TODO: log error obj
    throw new Error("Unknown structure passed to forEach; expected an iterable, observable, or a promise");
  }
}

// TODO: consider a growing ringbuffer?
function createBufferedIterator(obs, bufferPolicy) {
  let sub;
  let isDisposed = false;
  let iterator = {
    buffer: [],
    takers: [],
    take(taker) {
      if (this.buffer.length) {
        let value = this.buffer.shift();
        taker.commit(value);
      } else {
        this.takers.push(taker);
      }
    },
    put(value) {
      while (true) {
        let taker = this.takers.shift();
        if (!taker) {
          break;
        }

        if (!taker.active) {
          // TODO: is this needed?
          continue;
        }

        taker.commit(value);
        return;
      }

      this.buffer.push(value);
    },
    return() {
      // this needs a way of teardown
      this.dispose();
      return {
        done: true,
        value: undefined,
      };
    },
    next() {
      let defer = Ember.RSVP.defer();
      let taker = {
        active: true,
        commit(value) {
          this.active = false;
          defer.resolve(value);
        },
        then(r0, r1) {
          return defer.promise.then(r0, r1);
        },
      };
      this.take(taker);
      return taker;
    },
    dispose() {
      if (isDisposed) { return; }
      isDisposed = true;
      sub.dispose();
    },
    policy: bufferPolicy,
    start() {
    },
  };

  // TODO: refactor; this defers synchronous puts, as well as
  // the handling of the puts by takers.
  Ember.run.schedule('actions', null, () => {
    sub = obs.subscribe(v => {
      Ember.run.join(() =>{
        Ember.run.schedule('actions', null, () => {
          iterator.policy.put(v, iterator);
        });
      });
    });
  });

  return iterator;
}

