import { evaluateValue } from "./common.js";

export function initialiseUi(parent) {
  // Initialise some input-related data.

  let index = -1;
  let isPreviousDiscrete = true;

  parent.simulationUiInformation.input.forEach((input) => {
    let isDiscrete = input.possibleValues !== undefined;

    parent.firstScalarInput[++index] = !isDiscrete && isPreviousDiscrete;

    isPreviousDiscrete = isDiscrete;
  });

  // Initialise some output-related data.

  parent.simulationUiInformation.output.data.forEach((data) => {
    parent.simulationDataId[data.id] = data.name;
  });

  index = -1;

  parent.simulationUiInformation.output.plots.forEach((outputPlot) => {
    ++index;

    parent.layout[index] = {
      xaxis: {
        title: {
          text: outputPlot.xAxisTitle,
          font: {
            size: 10,
          },
        },
      },
      yaxis: {
        title: {
          text: outputPlot.yAxisTitle,
          font: {
            size: 10,
          },
        }
      },
    };

    parent.simulationData[index] = [{}];
  });
}

export function finaliseUi(parent) {
  // Finalise our UI, but only if we haven't already done so, we are mounted,
  // and we have some valid simulation UI information.

  if (!parent.hasFinalisedUi && parent.isMounted && parent.hasValidSimulationUiInformation) {
    // Configure the PlotVuer's.

    parent.$refs.output.classList.add("x" + parent.simulationUiInformation.output.plots.length);

    // Make sure that our UI is up to date.

    updateUi(parent);

    parent.hasFinalisedUi = true;
  }
}

export function updateUi(parent) {
  // Enable/disable all the elements.
  // Note: we do this using $nextTick() to be ensure that the UI has been fully
  //       mounted.

  parent.$nextTick(() => {
    let index = -1;

    parent.simulationUiInformation.input.forEach((input) => {
      parent.$children[++index].enabled = (input.enabled === undefined)?true:evaluateValue(parent, input.enabled);
    });
  });
}