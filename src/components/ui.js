import Vue from "vue";
import { evaluateValue } from "./common.js";

export function prepareForUi(parent) {
  let index = -1;

  parent.json.output.data.forEach((data) => {
    parent.simulationDataId[data.id] = data.name;
  });

  parent.json.output.plots.forEach((outputPlot) => {
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

const VueContainer = Vue.extend({
  template: `
    <div class="sliders-and-fields"/>
  `,
});

const VueInputNumber = Vue.extend({
  methods: {
    emitSynchroniseSliderAndInputNumber: function(value) {
      this.$emit("synchroniseSliderAndInputNumber", this.index, value);
    }
  },
  props: {
    disabled: Boolean,
    index: Number,
    maximumValue: Number,
    minimumValue: Number,
    parent: Object,
    vModel: Number,
  },
  template: `
    <el-input-number class="scalar" size="mini" v-model="vModel" :controls="false" :disabled="disabled" :max="maximumValue" :min="minimumValue" @change="emitSynchroniseSliderAndInputNumber" />
  `,
});

const VueLabel = Vue.extend({
  props: {
    classes: String,
    label: String,
  },
  template: `
    <p :class="classes">{{ label }}</p>
  `,
});

const VueSelect = Vue.extend({
  methods: {
    emitSelectionChanged: function(value) {
      this.$emit("selectionChanged", this.index, value);
    }
  },
  props: {
    index: Number,
    parent: Object,
    possibleValues: Array,
    vModel: Number,
  },
  template: `
    <el-select class="discrete" popper-class="discrete-popper" size="mini" v-model="vModel" :popper-append-to-body="false" @change="emitSelectionChanged">
      <el-option v-for="possibleValue in possibleValues" :key="possibleValue.value" :label="possibleValue.name" :value="possibleValue.value" />
    </el-select>
  `,
});

const VueSlider = Vue.extend({
  methods: {
    emitSynchroniseSliderAndInputNumber: function(value) {
      this.$emit("synchroniseSliderAndInputNumber", this.index, value);
    }
  },
  props: {
    disabled: Boolean,
    index: Number,
    maximumValue: Number,
    parent: Object,
    vModel: Number,
  },
  template: `
    <el-slider v-model="vModel" :disabled="disabled" :max="maximumValue" :show-input="false" :show-tooltip="false" @input="emitSynchroniseSliderAndInputNumber" />
  `,
});

export default class Ui {
  discreteElements = [];
  scalarElements = [];

  setVueAttributes(root, element) {
    root.attributes.forEach((attribute) => {
      element.setAttribute(attribute.nodeName, attribute.nodeValue);
    });

    element.children.forEach((childElement) => {
      this.setVueAttributes(root, childElement);
    });
  }

  addVueElement(root, parent, element) {
    element.$mount();

    this.setVueAttributes(root, element.$el);

    parent.appendChild(element.$el);
  }

  selectionChanged() {
    // Enable/disable all the scalar elements.

    let ui = (this instanceof Ui)?this:this.parent;

    ui.scalarElements.forEach((scalarElement) => {
      let enabled = scalarElement.enabled;

      if (enabled !== undefined) {
        let disabled = !evaluateValue(ui, enabled);

        scalarElement.slider.disabled = disabled;
        scalarElement.input_number.disabled = disabled;
      }
    });
  }

  synchroniseSliderAndInputNumber(index, value) {
    // Make sure that both a slider and its corresponding input number have
    // the same value.

    this.parent.scalarElements[index].slider.vModel = value;
    this.parent.scalarElements[index].input_number.vModel = value;
  }

  constructor(parent) {
    // Generate the UI for the input fields.

    let inputRoot = parent.$refs.input;
    let isPreviousDiscrete = true;
    let slidersAndFieldsContainer = undefined;
    let firstScalarInput = true;
    let discreteElementIndex = -1;
    let scalarElementIndex = -1;

    parent.json.input.forEach((input) => {
      // Determine whether we are dealing with a discrete or a scalar input.

      let isDiscrete = input.possibleValues !== undefined;

      // Determine our element mode and create a container for our sliders and
      // input numbers, if needed.

      if (!isDiscrete && isPreviousDiscrete) {
        slidersAndFieldsContainer = new VueContainer();

        this.addVueElement(inputRoot, inputRoot, slidersAndFieldsContainer);
      }

      isPreviousDiscrete = isDiscrete;

      // Add the Label.

      let label = new VueLabel({
        propsData: {
          classes: "default " + (isDiscrete?"discrete":firstScalarInput?"first-scalar":"scalar"),
          label: input.name,
        }
      });

      this.addVueElement(inputRoot, isDiscrete?inputRoot:slidersAndFieldsContainer.$el, label);

      firstScalarInput = isDiscrete;

      // Add a drop-down list or a slider and a text box depending on whether
      // we are dealing with a discrete or a scalar input.

      if (isDiscrete) {
        // Add the drop-down list.

        ++discreteElementIndex;

        let select = new VueSelect({
          propsData: {
            index: discreteElementIndex,
            parent: this,
            possibleValues: input.possibleValues,
            vModel: input.defaultValue,
          },
        });

        this.addVueElement(inputRoot, inputRoot, select);

        select.$on("selectionChanged", this.selectionChanged);

        // Keep track of the select and its id.

        this.discreteElements[discreteElementIndex] = {
          id: input.id,
          select: select,
        };
      } else {
        // Add the slider and input number.

        ++scalarElementIndex;

        let slider = new VueSlider({
          propsData: {
            index: scalarElementIndex,
            maximumValue: input.maximumValue,
            parent: this,
            vModel: input.defaultValue,
          },
        });
        let inputNumber = new VueInputNumber({
          propsData: {
            index: scalarElementIndex,
            maximumValue: input.maximumValue,
            minimumValue: input.minimumValue,
            parent: this,
            vModel: input.defaultValue,
          },
        });

        this.addVueElement(inputRoot, slidersAndFieldsContainer.$el, slider);
        this.addVueElement(inputRoot, slidersAndFieldsContainer.$el, inputNumber);

        slider.$on("synchroniseSliderAndInputNumber", this.synchroniseSliderAndInputNumber);
        inputNumber.$on("synchroniseSliderAndInputNumber", this.synchroniseSliderAndInputNumber);

        // Keep track of the slider and input number.

        this.scalarElements[scalarElementIndex] = {
          enabled: input.enabled,
          id: input.id,
          input_number: inputNumber,
          slider: slider,
        };
      }
    });

    // Configure the PlotVuer's.

    parent.$refs.output.classList.add("x" + parent.json.output.plots.length);

    // Enable/disable all the elements by pretending that a selection changed.

    this.selectionChanged();
  }
}
