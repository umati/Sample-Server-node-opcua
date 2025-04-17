// SPDX-License-Identifier: Apache-2.0
//
// Copyright (c) 2025 Alexander Inglessi
//
//   Licensed under the Apache License, Version 2.0 (the 'License');
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an 'AS IS' BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.

import {
  coerceLocalizedText,
  coerceNodeId,
  DataType,
  UAVariable,
  AddressSpace,
  NodeId,
  NodeIdType,
  LocalizedText,
} from "node-opcua";
import { red } from "../../utils/log";

export const createMachineToolEnergyLogic = async (
  addressSpace: AddressSpace,
): Promise<void> => {
  const idx = addressSpace?.getNamespaceIndex(
    "http://vdw.de/UA/MachineTool/Energy-Example/",
  );
  const iaIdx = addressSpace?.getNamespaceIndex(
    "http://opcfoundation.org/UA/IA/",
  );
  const mtoolIdx = addressSpace?.getNamespaceIndex(
    "http://opcfoundation.org/UA/MachineTool/",
  );

  // changes CurrentState each 10000 msec from Running to Interrupted
  setInterval(() => {
    const state = addressSpace?.findNode(`ns=${idx};i=6144`) as UAVariable;
    const stateId = addressSpace?.findNode(
      `ns=${idx};i=6145`,
    ) as UAVariable;
    const stateNumber = addressSpace?.findNode(
      `ns=${idx};i=6146`,
    ) as UAVariable;
    if (state?.readValue().value.value.text === "Running") {
      state?.setValueFromSource({
        value: new LocalizedText({ text: "Interrupted", locale: "en" }),
        dataType: DataType.LocalizedText,
      });
      stateId.setValueFromSource({
        value: coerceNodeId(`ns=${mtoolIdx};i=5040`),
        dataType: DataType.NodeId,
      });
      stateNumber.setValueFromSource({
        value: 3,
        dataType: DataType.UInt32,
      });
    } else {
      state?.setValueFromSource({
        value: new LocalizedText({ text: "Running", locale: "en" }),
        dataType: DataType.LocalizedText,
      });
      stateId.setValueFromSource({
        value: coerceNodeId(`ns=${mtoolIdx};i=5041`),
        dataType: DataType.NodeId,
      });
      stateNumber.setValueFromSource({
        value: 1,
        dataType: DataType.UInt32,
      });
    }
  }, 10000);

  // Simulate voltage and current fluctuiations every 1 sec.
  setInterval(() => {
    let v1 = getRandomInRange(225, 235);
    let v2 = getRandomInRange(225, 235);
    let v3 = getRandomInRange(225, 235);
    let c1 = getRandomInRange(1.9, 2.1);
    let c2 = getRandomInRange(1.9, 2.1);
    let c3 = getRandomInRange(1.9, 2.1);
    let p1 = v1 * c1;
    let p2 = v2 * c2;
    let p3 = v3 * c3;
    let p = p1 + p2 + p3;
    let e = p * 0.000278; // Wh
    const newV = {
        L1: v1,
        L2: v2,
        L3: v3
      };
    const newC = {
        L1: c1,
        L2: c2,
        L3: c3
      };
    const newP = {
        L1: p1,
        L2: p2,
        L3: p3
      };
    const voltage = addressSpace?.findNode(`ns=${idx};i=6196`) as UAVariable;
    voltage?.setValueFromSource({
      value: newV,
      dataType: DataType.ExtensionObject
    });
    const current = addressSpace?.findNode(`ns=${idx};i=6212`) as UAVariable;
    current?.setValueFromSource({
      value: newC,
      dataType: DataType.ExtensionObject
    });
    const power = addressSpace?.findNode(`ns=${idx};i=6147`) as UAVariable;
    power?.setValueFromSource({
      value: newP,
      dataType: DataType.ExtensionObject
    });
    const energyImport = addressSpace?.findNode(`ns=${idx};i=6164`) as UAVariable;
    let oldE = energyImport.readValue().value.value;
    energyImport?.setValueFromSource({
      value: oldE + e,
      dataType: DataType.Double,
    });
  }, 1000);

  // Simulate water flow fluctuiation every 1 sec.
  setInterval(() => {
    const waterFlow = addressSpace?.findNode(`ns=${idx};i=6256`) as UAVariable;
    waterFlow?.setValueFromSource({
      value: getRandomInRange(1.1, 1.3),
      dataType: DataType.Float,
    });
  }, 1000);

  // Simulate air flow fluctuiation every 1 sec.
  setInterval(() => {
    const airFlow = addressSpace?.findNode(`ns=${idx};i=6266`) as UAVariable;
    airFlow?.setValueFromSource({
      value: getRandomInRange(1.4, 1.6),
      dataType: DataType.Float,
    });
  }, 1000);

  function getRandomInRange(min: number, max: number): number {
    return (Math.random() * (max - min) + min);
  }

/*   const activeProgramName = addressSpace?.findNode(
    `ns=${idx};i=6026`,
  ) as UAVariable;
  if (activeProgramName !== null) {
    activeProgramName?.setValueFromSource({
      value: "Program_2",
      dataType: DataType.String,
    });
  } else {
    red("activeProgramName does not exist!");
  }

  const activeProgramNumberInList = addressSpace?.findNode(
    `ns=${idx};i=6027`,
  ) as UAVariable;
  if (activeProgramNumberInList !== null) {
    activeProgramNumberInList?.setValueFromSource({
      value: 1,
      dataType: DataType.UInt16,
    });
  } else {
    red("activeProgramNumberInList does not exist!");
  }

  const productionActiveProgramStateCurrentState = addressSpace?.findNode(
    `ns=${idx};i=6028`,
  ) as UAVariable;
  if (productionActiveProgramStateCurrentState !== null) {
    productionActiveProgramStateCurrentState?.setValueFromSource({
      value: coerceLocalizedText("Running"),
      dataType: DataType.LocalizedText,
    });
  } else {
    red("productionActiveProgramStateCurrentState does not exist!");
  }

  // changes CurrentState each 10000 msec from Running to Ended
  setInterval(() => {
    const state = addressSpace?.findNode(`ns=${idx};i=6028`) as UAVariable;
    const stateNumber = addressSpace?.findNode(
      `ns=${idx};i=6029`,
    ) as UAVariable;
    if (state?.readValue().value.value.text === "Running") {
      state?.setValueFromSource({
        value: coerceLocalizedText("Ended"),
        dataType: DataType.LocalizedText,
      });
      stateNumber.setValueFromSource({
        value: coerceNodeId(2),
        dataType: DataType.NodeId,
      });
    } else {
      state?.setValueFromSource({
        value: coerceLocalizedText("Running"),
        dataType: DataType.LocalizedText,
      });
      stateNumber.setValueFromSource({
        value: coerceNodeId(1),
        dataType: DataType.NodeId,
      });
    }
  }, 10000);

  // increments the value of FeedOverride by 5 each sec
  let override = 50;
  setInterval(() => {
    override += 5;
    if (override > 120) {
      override = 50;
    }
    const feedOverride = addressSpace?.findNode(
      `ns=${idx};i=6017`,
    ) as UAVariable;
    feedOverride.setValueFromSource({
      value: override,
      dataType: DataType.Double,
    });
  }, 1000);

  const spindleOverride = addressSpace?.findNode(
    `ns=${idx};i=6070`,
  ) as UAVariable;
  spindleOverride?.setValueFromSource({
    value: 100,
    dataType: DataType.Double,
  });

  // writing ExtensionObject (Range)
  const spindleEURange = addressSpace?.constructExtensionObject(
    new NodeId(NodeIdType.NUMERIC, 884, 0),
    {
      low: 60.0,
      high: 100.0,
    },
  );
  const spindleOverrideRange = addressSpace?.findNode(
    `ns=${idx};i=6072`,
  ) as UAVariable;
  spindleOverrideRange?.setValueFromSource({
    value: spindleEURange,
    dataType: DataType.ExtensionObject,
  });

  // writing a enum
  const channel1 = addressSpace?.findNode(`ns=${idx};i=6061`) as UAVariable;
  channel1.setValueFromSource({
    value: 1,
    dataType: DataType.Int32,
  }); */
};
