<template>
  <div class="simulation-vuer" v-loading="showUserMessage" :element-loading-text="userMessage">
    <p v-if="!hasValidSimulationUiInfo && !showUserMessage" class="default error"><span class="error">Error:</span> an unknown or invalid model was provided.</p>
    <div class="main" v-if="hasValidSimulationUiInfo">
      <div class="main-left">
        <p class="default name">{{name}}</p>
        <el-divider></el-divider>
        <p class="default input-parameters">Input parameters</p>
        <div class="input scrollbar">
          <SimulationVuerInput v-for="(input, index) in simulationUiInfo.input"
            ref="simInput"
            :defaultValue="input.defaultValue"
            :key="`input-${index}`"
            :name="input.name"
            :maximumValue="input.maximumValue"
            :minimumValue="input.minimumValue"
            :possibleValues="input.possibleValues"
            :stepValue="input.stepValue"
          />
        </div>
        <div class="primary-button">
          <el-button type="primary" size="small" @click="startSimulation()">Run Simulation</el-button>
        </div>
        <div class="secondary-button" v-if="uuid">
          <el-button size="small" @click="runOnOsparc()">Run on oSPARC</el-button>
        </div>
        <div class="secondary-button">
          <el-button size="small" @click="viewDataset()">View Dataset</el-button>
        </div>
        <p class="default note" v-if="uuid">Additional parameters are available on oSPARC</p>
      </div>
      <div class="main-right" ref="output" v-show="isSimulationValid">
        <PlotVuer v-for="(outputPlot, index) in simulationUiInfo.output.plots"
          :key="`output-${index}`"
          :metadata="plotMetadata(index)"
          :data-source="{data: simulationData[index]}"
          :plotLayout="layout[index]"
          :plotType="'plotly-only'"
          :selectorUi="false"
        />
      </div>
      <div class="main-right" v-show="!isSimulationValid">
        <p class="default error"><span class="error">Error:</span> <span v-html="errorMessage"></span>.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { PlotVuer } from "@abi-software/plotvuer";
import "@abi-software/plotvuer/dist/style.css";
import SimulationVuerInput from "./SimulationVuerInput.vue";
import { ElButton, ElDivider, ElLoading } from "element-plus";
import { evaluateValue, evaluateSimulationValue, OPENCOR_SOLVER_NAME } from "./common.js";
import { validJson } from "./json.js";
import { initialiseUi, finaliseUi } from "./ui.js";

export default {
  name: "SimulationVuer",
  components: {
    PlotVuer,
    SimulationVuerInput,
    ElButton,
    ElDivider,
    ElLoading,
  },
  props: {
    apiLocation: {
      required: true,
      type: String,
    },
    id: {
      required: true,
      type: Number,
    },
  },
  data: function() {
    let xmlhttp = new XMLHttpRequest();
    let name = undefined;
    let uuid = undefined;

    xmlhttp.open("GET", this.apiLocation + "/sim/dataset/" + this.id, false);
    xmlhttp.setRequestHeader("Content-type", "application/json");
    xmlhttp.onreadystatechange = () => {
      if (xmlhttp.readyState === 4) {
        if (xmlhttp.status === 200) {
          let datasetInfo = JSON.parse(xmlhttp.responseText);

          name = datasetInfo.name;
          uuid = (datasetInfo.study !== undefined)?datasetInfo.study.uuid:undefined;
        }
      }
    };
    xmlhttp.send();

    return {
      errorMessage: "",
      hasFinalisedUi: false,
      hasValidSimulationUiInfo: false,
      isMounted: false,
      isSimulationValid: true,
      layout: [],
      name: name,
      perfectScollbarOptions: {
        suppressScrollX: true,
      },
      showUserMessage: false,
      simulationData: [],
      simulationDataId: {},
      simulationUiInfo: {},
      userMessage: "",
      ui: null,
      uuid: uuid,
    };
  },
  methods: {
    plotMetadata(index) {
      return {
        version: "1.1.0",
        type: "plot",
        attrs: {
          style: "timeseries",
          layout: this.layout[index],
        },
      };
    },
    retrieveAndBuildSimulationUi(simulationUiInfo) {
      // Keep track of the simulation UI information.

      this.simulationUiInfo = simulationUiInfo;

      // Make sure that the simulation UI information is valid.

      this.hasValidSimulationUiInfo = validJson(this.simulationUiInfo);

      if (!this.hasValidSimulationUiInfo) {
        return;
      }

      // Initialise our UI.

      initialiseUi(this);

      // Finalise our UI.
      // Note: we try both here and in the mounted() function since we have no
      //       idea how long it's going to take to retrieve the simulation UI
      //       information.

      this.$nextTick(() => {
        finaliseUi(this);

        this.simulationData.forEach((data, index) => {
          this.simulationData[index] = [{
            x: [],
            y: [],
            type: "scatter",
          }];
        });
      });
    },
    runOnOsparc() {
      window.open(`https://osparc.io/study/${this.uuid}`, "_blank");
    },
    viewDataset() {
      window.open(`https://sparc.science/datasets/${this.id}?type=dataset`, "_blank");
    },
    retrieveRequest(request) {
      // Settings specific to OpenCOR/oSPARC.

      let isOpencorSimulation = request.solver.name === OPENCOR_SOLVER_NAME;

      if (isOpencorSimulation) {
        request.opencor = {
          model_url: this.simulationUiInfo.simulation.opencor.resource,
          json_config: {},
        };
      } else {
        request.osparc = {};
      }

      // Specify the ending point and point interval, if we have some.

      if (   isOpencorSimulation
          && (this.simulationUiInfo.simulation.opencor.endingPoint !== undefined)
          && (this.simulationUiInfo.simulation.opencor.pointInterval !== undefined)) {
        request.opencor.json_config.simulation = {
          "Ending point": this.simulationUiInfo.simulation.opencor.endingPoint,
          "Point interval": this.simulationUiInfo.simulation.opencor.pointInterval,
        };
      }

      // Specify the parameters, if any.

      if (this.simulationUiInfo.parameters !== undefined) {
        let parameters = {};

        this.simulationUiInfo.parameters.forEach((parameter) => {
          parameters[parameter.name] = evaluateValue(this, parameter.value);
        });

        if (isOpencorSimulation) {
          request.opencor.json_config.parameters = parameters;
        } else {
          request.osparc.job_inputs = parameters;
        }
      }

      // Specify what we want to retrieve, if anything.

      if (isOpencorSimulation && (this.simulationUiInfo.output.data !== undefined))  {
        let index = -1;

        request.opencor.json_config.output = [];

        this.simulationUiInfo.output.data.forEach((outputData) => {
          request.opencor.json_config.output[++index] = outputData.name;
        });
      }

      return request;
    },
    processSimulationResults(results) {
      // Convert, if needed, the results to a JSON format that is compatible
      // with our OpenCOR results.

      if (typeof(results) === "string") {
        const SPACES = /[ \t]+/g;

        let lines = results.trim().split("\n");
        let iMax = lines[0].trim().split(SPACES).length;

        results = {};

        for (let i = 0; i < iMax; ++i) {
          results[i] = [];
        }

        let i = -1;

        lines.forEach((line) => {
          ++i;

          let j = -1;
          let values = line.trim().split(SPACES);

          values.forEach((value) => {
            results[++j][i] = Number(value);
          });
        });
      }

      // Get the results ready for plotting.

      let index = -1;
      let iMax = results[this.simulationDataId[Object.keys(this.simulationDataId)[0]]].length;

      this.simulationUiInfo.output.plots.forEach((outputPlot) => {
        let xValue = [];
        let yValue = [];

        for (let i = 0; i < iMax; ++i) {
          xValue[i] = evaluateSimulationValue(this, results, outputPlot.xValue, i);
          yValue[i] = evaluateSimulationValue(this, results, outputPlot.yValue, i);
        }

        this.simulationData[++index] = [
          {
            x: xValue,
            y: yValue,
            type: "scatter",
          },
        ];
      });
    },
    checkSimulation(data) {
      // Check the simulation.

      let xmlhttp = new XMLHttpRequest();

      xmlhttp.open("POST", this.apiLocation + "/check_simulation", true);
      xmlhttp.setRequestHeader("Content-type", "application/json");
      xmlhttp.onreadystatechange = () => {
        if (xmlhttp.readyState === 4) {
          if (xmlhttp.status === 200) {
            let response = JSON.parse(xmlhttp.responseText);

            this.isSimulationValid = response.status === "ok";

            if (this.isSimulationValid) {
              if (response.results !== undefined) {
                // The simulation is finished, so process its results.

                this.showUserMessage = false;

                this.processSimulationResults(response.results);
              } else {
                // The simulation is not yet finished, so check again in a
                // second.

                let that = this;

                setTimeout(function() {
                  that.checkSimulation(data);
                }, 1000);
              }
            } else {
              this.showUserMessage = false;
              this.errorMessage = response.description;
            }
          } else {
            this.isSimulationValid = false;
            this.showUserMessage = false;
            this.errorMessage = xmlhttp.statusText.toLowerCase() + " (<a href='https://httpstatuses.com/" + xmlhttp.status + "/' target='_blank'>" + xmlhttp.status + "</a>)";
          }
        }
      };
      xmlhttp.send(JSON.stringify(data));
    },
    startSimulation() {
      // Retrieve the solver to be used for the simulation.

      let solver = undefined;

      this.simulationUiInfo.simulation.solvers.forEach((crtSolver) => {
        if ((crtSolver.if === undefined) || evaluateValue(this, crtSolver.if)) {
          solver = crtSolver;
        }
      });

      if (solver === undefined) {
        console.warn("SIMULATION: no solver name and/or solver version specified.");

        return;
      }

      // Start the simulation (after resetting our previous simulation data, in
      // case there were sonme).
      // Note: we use this.$nextTick() so that the user message is shown before
      //       we get to post our HTTP request.

      this.userMessage = "Loading simulation results...";
      this.showUserMessage = true;

      this.$nextTick(() => {
        this.simulationData = [];

        let xmlhttp = new XMLHttpRequest();

        xmlhttp.open("POST", this.apiLocation + "/start_simulation", true);
        xmlhttp.setRequestHeader("Content-type", "application/json");
        xmlhttp.onreadystatechange = () => {
          if (xmlhttp.readyState === 4) {
            if (xmlhttp.status === 200) {
              let response = JSON.parse(xmlhttp.responseText);

              this.isSimulationValid = response.status === "ok";

              if (this.isSimulationValid) {
                this.checkSimulation(response.data);
              } else {
                this.showUserMessage = false;
                this.errorMessage = response.description;
              }
            } else {
              this.isSimulationValid = false;
              this.showUserMessage = false;
              this.errorMessage = xmlhttp.statusText.toLowerCase() + " (<a href='https://httpstatuses.com/" + xmlhttp.status + "/' target='_blank'>" + xmlhttp.status + "</a>)";
            }
          }
        };
        xmlhttp.send(JSON.stringify(this.retrieveRequest({
          solver: solver
        })));
      });
    },
  },
  created: function() {
    // Try to retrieve the UI information, but only if we have a name.

    if (this.name !== undefined) {
      this.userMessage = "Retrieving UI information...";
      this.showUserMessage = true;

      // Retrieve and build the simulation UI.
      // Note: we use this.$nextTick() so that the user message is shown before
      //       we get to post our HTTP request.

      this.$nextTick(() => {
        let xmlhttp = new XMLHttpRequest();

        xmlhttp.open("GET", this.apiLocation + "/simulation_ui_file/" + this.id, true);
        xmlhttp.setRequestHeader("Content-type", "application/json");
        xmlhttp.onreadystatechange = () => {
          if (xmlhttp.readyState === 4) {
            this.showUserMessage = false;

            if (xmlhttp.status === 200) {
              this.retrieveAndBuildSimulationUi(JSON.parse(xmlhttp.responseText));
            }
          }
        };
        xmlhttp.send();
      });
    }
  },
  mounted: function() {
    // Finalise our UI.
    // Note: we try both here and in the created() function since we have no
    //       idea how long it's going to take to retrieve the simulation UI
    //       information.

    this.isMounted = true;

    finaliseUi(this);
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped lang="scss">

.simulation-vuer {
  --el-color-primary: #8300BF;
  --el-color-primary-light-7: #DAB3EC;
  --el-color-primary-light-8: #E6CCF2;
  --el-color-primary-light-9: #F3E6F9;
}

:deep( .el-button:hover) {
  box-shadow: -3px 2px 4px #00000040;
}
:deep( .el-divider) {
  margin: -8px 0 8px 0 !important;
  width: 210px;
}
:deep( .el-loading-spinner) {
  .path {
    stroke: #8300BF;
  }
  i, .el-loading-text {
    color: #8300BF;
  }
}
div.input {
  border: 1px solid #dcdfe6;
  padding: 4px;
  height: 300px;
}
div.main {
  display: grid;
  --mainLeftWidth: 243px;
  grid-template-columns: var(--mainLeftWidth) calc(100% - var(--mainLeftWidth));
  height: 100%;
}
div.main-left {
  border-right: 1px solid #dcdfe6;
  padding: 12px 20px 12px 12px;
  height: 100%;
  overflow: auto;
}
div.main-right.x1 {
  height: 100%;
}
div.main-right.x2 {
  height: 50%;
}
div.main-right.x3 {
  height: 33.333%;
}
div.main-right.x4 {
  height: 25%;
}
div.main-right.x5 {
  height: 20%;
}
div.main-right.x6 {
  height: 16.667%;
}
div.main-right.x7 {
  height: 14.286%;
}
div.main-right.x8 {
  height: 12.5%;
}
div.main-right.x9 {
  height: 11.111%;
}
:deep( div.main-right div.controls) {
  height: 0;
}
div.primary-button,
div.secondary-button {
  display: flex;
  justify-content: flex-end;
  width: 210px;
}
div.primary-button {
  margin-top: 14px;
}
div.secondary-button {
  margin-top: 8px;
}
div.primary-button .el-button,
div.secondary-button .el-button,
div.primary-button .el-button:hover,
div.secondary-button .el-button:hover {
  width: 121px;
  border-color: #8300bf;
}
div.primary-button .el-button,
div.primary-button .el-button:hover {
  background-color: #8300bf;
}
div.secondary-button .el-button,
div.secondary-button .el-button:hover {
  background-color: #f9f2fc;
  color: #8300bf;
}
div.scrollbar {
  overflow-y: scroll;
  scrollbar-width: thin;
}
div.scrollbar::-webkit-scrollbar {
  width: 8px;
  right: -8px;
  background-color: #f5f5f5;
}
div.scrollbar::-webkit-scrollbar-thumb {
  border-radius: 4px;
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.06);
  background-color: #979797;
}
div.scrollbar::-webkit-scrollbar-track {
  border-radius: 10px;
  background-color: #f5f5f5;
}
div.simulation-vuer {
  height: 100%;
}
p.default {
  font-family: Asap, sans-serif;
  letter-spacing: 0;
  margin: 16px 0;
  text-align: start;
}
p.error {
  margin-left: 16px;
}
p.input-parameters {
  margin-bottom: 8px;
}
p.name,
p.input-parameters {
  margin-top: 0;
  font-weight: 500 /* Medium */;
}
p.name {
  line-height: 20px;
}
p.note {
  font-size: 12px;
  line-height: 16px;
}
span.error {
  font-weight: 500 /* Medium */;
}
</style>
