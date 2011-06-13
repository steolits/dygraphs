// Copyright 2011 Google Inc. All Rights Reserved.

/**
 * @fileoverview Description of this file.
 * @author danvk@google.com (Dan Vanderkam)
 *
 * A ticker is a function with the following interface:
 *
 * function(a, b, pixels, pixels_per_tick, options_view, forced_values);
 * -> [ { v: tick1_v, label: tick1_label[, label_v: label_v1] },
 *      { v: tick2_v, label: tick2_label[, label_v: label_v2] },
 *      ...
 *    ]
 *
 * The returned value is called a "tick list".
 *
 * Arguments
 * ---------
 *
 * [a, b] is the range of the axis for which ticks are being generated. For a
 * numeric axis, these will simply be numbers. For a date axis, these will be
 * millis since epoch (convertable to Date objects using "new Date(a)" and "new
 * Date(b)").
 *
 * pixels is the length of the axis in pixels and pixels_per_tick is the
 * minimum amount of space to be allotted to each label. For instance, if
 * pixels=400 and pixels_per_tick=40 then the ticker should return between
 * zero and ten (400/40) ticks.
 *
 * opts provides access to chart- and axis-specific options. It can be used to
 * access number/date formatting code/options, check for a log scale, etc.
 *
 * dygraph is the Dygraph object for which an axis is being constructed.
 *
 * forced_values is used for secondary y-axes. The tick positions are typically
 * set by the primary y-axis, so the secondary y-axis has no choice in where to
 * put these. It simply has to generate labels for these data values.
 *
 * Tick lists
 * ----------
 * Typically a tick will have both a grid/tick line and a label at one end of
 * that line (at the bottom for an x-axis, at left or right for the y-axis).
 *
 * A tick may be missing one of these two components:
 * - If "label_v" is specified instead of "v", then there will be no tick or
 *   gridline, just a label.
 * - Similarly, if "label" is not specified, then there will be a gridline
 *   without a label.
 *
 * This flexibility is useful in a few situations:
 * - For log scales, some of the tick lines may be too close to all have labels.
 * - For date scales where years are being displayed, it is desirable to display
 *   tick marks at the beginnings of years but labels (e.g. "2006") in the
 *   middle of the years.
 */

Dygraph.newNumericTicks = function(a, b, pixels, pixels_per_tick,
                                   opts, dygraph, vals) {
  var ticks = [];
  if (vals) {
    for (var i = 0; i < vals.length; i++) {
      ticks.push({v: vals[i]});
    }
  } else {
    // TODO(danvk): factor this log-scale block out into a separate function.
    if (opts("logscale")) {
      // NOTE(konigsberg): Dan, should self.height_ be self.plotter_.area.h?
      var nTicks  = Math.floor(pixels / pixels_per_tick);
      var minIdx = Dygraph.binarySearch(a, Dygraph.PREFERRED_LOG_TICK_VALUES, 1);
      var maxIdx = Dygraph.binarySearch(b, Dygraph.PREFERRED_LOG_TICK_VALUES, -1);
      if (minIdx == -1) {
        minIdx = 0;
      }
      if (maxIdx == -1) {
        maxIdx = Dygraph.PREFERRED_LOG_TICK_VALUES.length - 1;
      }
      // Count the number of tick values would appear, if we can get at least
      // nTicks / 4 accept them.
      var lastDisplayed = null;
      if (maxIdx - minIdx >= nTicks / 4) {
        for (var idx = maxIdx; idx >= minIdx; idx--) {
          var tickValue = Dygraph.PREFERRED_LOG_TICK_VALUES[idx];
          var pixel_coord = Math.log(tickValue / a) / Math.log(b / a) * pixels;
          var tick = { v: tickValue };
          if (lastDisplayed == null) {
            lastDisplayed = {
              tickValue : tickValue,
              pixel_coord : pixel_coord
            };
          } else {
            if (pixel_coord - lastDisplayed.pixel_coord >= pixels_per_tick) {
              lastDisplayed = {
                tickValue : tickValue,
                pixel_coord : pixel_coord
              };
            } else {
              tick.label = "";
            }
          }
          ticks.push(tick);
        }
        // Since we went in backwards order.
        ticks.reverse();
      }
    }

    // ticks.length won't be 0 if the log scale function finds values to insert.
    if (ticks.length == 0) {
      // Basic idea:
      // Try labels every 1, 2, 5, 10, 20, 50, 100, etc.
      // Calculate the resulting tick spacing (i.e. this.height_ / nTicks).
      // The first spacing greater than pixelsPerYLabel is what we use.
      // TODO(danvk): version that works on a log scale.
      var kmg2 = opts("labelsKMG2");
      if (kmg2) {
        var mults = [1, 2, 4, 8];
      } else {
        var mults = [1, 2, 5];
      }
      var scale, low_val, high_val, nTicks;
      for (var i = -10; i < 50; i++) {
        if (kmg2) {
          var base_scale = Math.pow(16, i);
        } else {
          var base_scale = Math.pow(10, i);
        }
        for (var j = 0; j < mults.length; j++) {
          scale = base_scale * mults[j];
          low_val = Math.floor(a / scale) * scale;
          high_val = Math.ceil(b / scale) * scale;
          nTicks = Math.abs(high_val - low_val) / scale;
          var spacing = pixels / nTicks;
          // wish I could break out of both loops at once...
          if (spacing > pixels_per_tick) break;
        }
        if (spacing > pixels_per_tick) break;
      }

      // Construct the set of ticks.
      // Allow reverse y-axis if it's explicitly requested.
      if (low_val > high_val) scale *= -1;
      for (var i = 0; i < nTicks; i++) {
        var tickV = low_val + i * scale;
        ticks.push( {v: tickV} );
      }
    }
  }

  // Add formatted labels to the ticks.
  var k;
  var k_labels = [];
  if (opts("labelsKMB")) {
    k = 1000;
    k_labels = [ "K", "M", "B", "T" ];
  }
  if (opts("labelsKMG2")) {
    if (k) self.warn("Setting both labelsKMB and labelsKMG2. Pick one!");
    k = 1024;
    k_labels = [ "k", "M", "G", "T" ];
  }

  var formatter = opts('yAxisLabelFormatter') || opts('yValueFormatter');

  // Add labels to the ticks.
  for (var i = 0; i < ticks.length; i++) {
    if (ticks[i].label !== undefined) continue;  // Use current label.
    var tickV = ticks[i].v;
    var absTickV = Math.abs(tickV);
    var label = formatter(tickV, dygraph);
    if (k_labels.length > 0) {
      // TODO(danvk): should this be integrated into the axisLabelFormatter?
      // Round up to an appropriate unit.
      var n = k*k*k*k;
      for (var j = 3; j >= 0; j--, n /= k) {
        if (absTickV >= n) {
          label = Dygraph.round_(tickV / n, opts('digitsAfterDecimal')) +
              k_labels[j];
          break;
        }
      }
    }
    ticks[i].label = label;
  }

  return ticks;
};


Dygraph.newDateTicker = function(a, b, pixels, pixels_per_tick,
                                 opts, dygraph, vals) {
  var chosen = -1;
  for (var i = 0; i < Dygraph.NUM_GRANULARITIES; i++) {
    var num_ticks = Dygraph.newNumDateTicks(a, b, i);
    if (pixels / num_ticks >= pixels_per_tick) {
      chosen = i;
      break;
    }
  }

  if (chosen >= 0) {
    return Dygraph.newGetDateAxis(a, b, chosen, opts);
  } else {
    // TODO(danvk): signal error.
  }
};

Dygraph.newNumDateTicks = function(start_time, end_time, granularity) {
  if (granularity < Dygraph.MONTHLY) {
    // Generate one tick mark for every fixed interval of time.
    var spacing = Dygraph.SHORT_SPACINGS[granularity];
    return Math.floor(0.5 + 1.0 * (end_time - start_time) / spacing);
  } else {
    var year_mod = 1;  // e.g. to only print one point every 10 years.
    var num_months = 12;
    if (granularity == Dygraph.QUARTERLY) num_months = 3;
    if (granularity == Dygraph.BIANNUAL) num_months = 2;
    if (granularity == Dygraph.ANNUAL) num_months = 1;
    if (granularity == Dygraph.DECADAL) { num_months = 1; year_mod = 10; }
    if (granularity == Dygraph.CENTENNIAL) { num_months = 1; year_mod = 100; }

    var msInYear = 365.2524 * 24 * 3600 * 1000;
    var num_years = 1.0 * (end_time - start_time) / msInYear;
    return Math.floor(0.5 + 1.0 * num_years * num_months / year_mod);
  }
};

Dygraph.newGetDateAxis = function(start_time, end_time, granularity, opts) {
  var formatter = opts("xAxisLabelFormatter");  // TODO(danvk): fix
  var ticks = [];
  if (granularity < Dygraph.MONTHLY) {
    // Generate one tick mark for every fixed interval of time.
    var spacing = Dygraph.SHORT_SPACINGS[granularity];
    var format = '%d%b';  // e.g. "1Jan"

    // Find a time less than start_time which occurs on a "nice" time boundary
    // for this granularity.
    var g = spacing / 1000;
    var d = new Date(start_time);
    if (g <= 60) {  // seconds
      var x = d.getSeconds(); d.setSeconds(x - x % g);
    } else {
      d.setSeconds(0);
      g /= 60;
      if (g <= 60) {  // minutes
        var x = d.getMinutes(); d.setMinutes(x - x % g);
      } else {
        d.setMinutes(0);
        g /= 60;

        if (g <= 24) {  // days
          var x = d.getHours(); d.setHours(x - x % g);
        } else {
          d.setHours(0);
          g /= 24;

          if (g == 7) {  // one week
            d.setDate(d.getDate() - d.getDay());
          }
        }
      }
    }
    start_time = d.getTime();

    for (var t = start_time; t <= end_time; t += spacing) {
      ticks.push({ v:t, label: formatter(new Date(t), granularity) });
    }
  } else {
    // Display a tick mark on the first of a set of months of each year.
    // Years get a tick mark iff y % year_mod == 0. This is useful for
    // displaying a tick mark once every 10 years, say, on long time scales.
    var months;
    var year_mod = 1;  // e.g. to only print one point every 10 years.

    if (granularity == Dygraph.MONTHLY) {
      months = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ];
    } else if (granularity == Dygraph.QUARTERLY) {
      months = [ 0, 3, 6, 9 ];
    } else if (granularity == Dygraph.BIANNUAL) {
      months = [ 0, 6 ];
    } else if (granularity == Dygraph.ANNUAL) {
      months = [ 0 ];
    } else if (granularity == Dygraph.DECADAL) {
      months = [ 0 ];
      year_mod = 10;
    } else if (granularity == Dygraph.CENTENNIAL) {
      months = [ 0 ];
      year_mod = 100;
    } else {
      Dygraph.warn("Span of dates is too long");
    }

    var start_year = new Date(start_time).getFullYear();
    var end_year   = new Date(end_time).getFullYear();
    var zeropad = Dygraph.zeropad;
    for (var i = start_year; i <= end_year; i++) {
      if (i % year_mod != 0) continue;
      for (var j = 0; j < months.length; j++) {
        var date_str = i + "/" + zeropad(1 + months[j]) + "/01";
        var t = Dygraph.dateStrToMillis(date_str);
        if (t < start_time || t > end_time) continue;
        ticks.push({ v:t, label: formatter(new Date(t), granularity) });
      }
    }
  }

  return ticks;
};

