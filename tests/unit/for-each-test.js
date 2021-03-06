import Ember from 'ember';
import { forEach } from 'ember-concurrency';
import { interval, _numIntervals } from 'ember-concurrency';

module('Unit: forEach');

const Observable = window.Rx.Observable;

test("forEach throws an error if used outside of task without .attach", function(assert) {
  assert.expect(1);

  let obj;
  try {
    Ember.run(() => {
      obj = Ember.Object.create({
        foo() {
          forEach([], Ember.K);
        },
      });
    });

    Ember.run(obj, 'foo');
  } catch(e) {
    assert.equal(e.message, "You must call forEach(...).attach(this) if you're using forEach outside of a generator function");
  }
});

test("forEach.attach() prevents the exception", function(assert) {
  assert.expect(0);
  Ember.run(() => {
    let obj = Ember.Object.create();
    forEach([], Ember.K).attach(obj);
  });
});

test("forEach loops over arrays", function(assert) {
  assert.expect(1);
  let arr = [];
  Ember.run(() => {
    let obj = Ember.Object.create();
    forEach([1,2,3], v => arr.push(v)).attach(obj);
  });
  assert.deepEqual(arr, [1,2,3]);
});

test("`this` in forEach mapper fn is the attached host obj: regular function", function(assert) {
  assert.expect(1);
  Ember.run(() => {
    let obj = Ember.Object.create();
    forEach([1], function() {
      assert.equal(this, obj);
    }).attach(obj);
  });
});

test("`this` in forEach mapper fn is the attached host obj: generator function", function(assert) {
  assert.expect(1);
  Ember.run(() => {
    let obj = Ember.Object.create();
    forEach([1], function * () {
      assert.equal(this, obj);
    }).attach(obj);
  });
});

test("forEach blocks on async values returned from fns, discontinues on owner destruction: regular function", function(assert) {
  assert.expect(6);
  let defer, obj;
  let val = 0;
  Ember.run(() => {
    obj = Ember.Object.create();
    forEach([1,2,3], v => {
      val = v;
      assert.ok(v !== 3, "loop should not hit the third iteration");
      defer = Ember.RSVP.defer();
      return defer.promise.then(() => v);
    }).attach(obj);
  });
  assert.equal(val, 1);
  Ember.run(defer.resolve);
  assert.equal(val, 2);
  Ember.run(obj, 'destroy');
  assert.equal(val, 2);
  Ember.run(defer.resolve);
  assert.equal(val, 2);
});

/*
test("forEach blocks on async values returned from fns, discontinues on owner destruction: generator function", function(assert) {
  assert.expect(6);
  let defer, obj;
  let val = 0;
  Ember.run(() => {
    obj = Ember.Object.create();
    forEach([1,2,3], function * (v) {
      val = v;
      assert.ok(v !== 3, "loop should not hit the third iteration");
      defer = Ember.RSVP.defer();
      return defer.promise.then(() => v);
    }).attach(obj);
  });
  assert.equal(val, 1);
  Ember.run(defer.resolve);
  assert.equal(val, 2);
  Ember.run(obj, 'destroy');
  assert.equal(val, 2);
  Ember.run(defer.resolve);
  assert.equal(val, 2);
});
*/

test("forEach allows yielding promises to pause iteration", function(assert) {
  assert.expect(4);
  let defer, obj;
  Ember.run(() => {
    obj = Ember.Object.create();
    forEach([1,2], function * () {
      defer = Ember.RSVP.defer();
      let val;
      val = yield defer.promise;
      assert.equal(val, 'a');
      defer = Ember.RSVP.defer();
      val = yield defer.promise;
      assert.equal(val, 'b');
    }).attach(obj);
  });
  Ember.run(null, defer.resolve, 'a');
  Ember.run(null, defer.resolve, 'b');
  Ember.run(null, defer.resolve, 'a');
  Ember.run(null, defer.resolve, 'b');
  Ember.run(null, defer.resolve, 'c');
});

test("forEach can loop over time intervals", function(assert) {
  QUnit.stop();
  assert.expect(12);
  let obj, isValid = true;

  assert.equal(_numIntervals, 0, "num intervals starts off at 0");

  let i = 0;
  Ember.run(() => {
    obj = Ember.Object.create();
    forEach(interval(10), function * () {
      assert.equal(_numIntervals, 1, "only one interval running at a given time");
      i++;
      assert.ok(isValid, "should not keep iterating");
      if (i === 5) {
        isValid = false;
        obj.destroy();
        Ember.run.next(() => {
          assert.equal(_numIntervals, 0);
          QUnit.start();
        });
      }
    }).attach(obj);
  });
});

test("forEach can cancel observables on the first iteration", function(assert) {
  QUnit.stop();
  assert.expect(1);
  Ember.run(() => {
    let obj = Ember.Object.create();
    forEach(Observable.range(1,10).delay(1), function * (v) {
      assert.equal(v, 1);
      obj.destroy();
      QUnit.start();
    }).attach(obj);
  });
});

test("forEach: yielding interval() just does one-off timers", function(assert) {
  QUnit.stop();
  assert.expect(2);
  let obj;
  Ember.run(() => {
    obj = Ember.Object.create();
    forEach([1,2], function * (v) {
      assert.equal(v, 1);
      yield interval(10);
      yield interval(10);
      yield interval(10);
      obj.destroy();

      Ember.run.later(() => {
        assert.equal(_numIntervals, 0);
        QUnit.start();
      }, 50);
    }).attach(obj);
  });
});

