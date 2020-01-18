# Ember Metrics

A node script to automate the collection of six build profiles multiple times.

1. Cold dev build
2. Warm dev build
3. Cold prod build
4. Warm prod build
5. Server initial build
6. Server rebuild

## Why multiple times?

Because any single run could be an outlier. By collecting multiple timings of the same build profile, a stable median can be derived.

## How are the metrics extracted from the Ember commands?

By using the `BROCCOLI_VIZ=1` environment variable, which will capture all build metrics in a JSON file using the Heimdall tool chain.

## What can I do with the metrics once I have them?

The quickest way to make use of the metrics is by using the [online heimdall visualizer](https://heimdalljs.github.io/heimdalljs-visualizer/), where you can upload one of the output files and explore the metrics. However, as mentioned, part of this tool is collecting many timings to come to statistically sound conclusions. If you wish to work with this data in aggregate, I recommend checking out the [Sass Timings Report](https://github.com/DingoEatingFuzz/sass-timings-report) project, which has a lot of general purpose code for traversing these timing trees and some examples of deriving values across multiple timing files.
