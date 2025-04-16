// SPDX-License-Identifier: Apache-2.0
//
// Copyright (c) 2021-2024 Andreas Heine
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

import { OPCUAServer } from "node-opcua";

import { green, red } from "./utils/log";

import { createOwnServerAddressspaceLogic } from "./serveraddressspace/serveraddressspace";
import { createMyMachineLogic } from "./machines/mymachine/mymachine";
import { createShowCaseMachineToolLogic } from "./machines/machinetool/showcasemachinetool";
import { createMachineToolExampleLogic } from "./machines/machinetool/machinetool-example";
import { createMotionDeviceSystemLogic } from "./machines/motiondevicesystem/motiondevicesystem";
import { createGenericPRLogic } from "./machines/PlasticsRubber/generic";
import { create40077Logic } from "./machines/PlasticsRubber/40077";
import { create40079Logic } from "./machines/PlasticsRubber/40079";
import { create40084_3Logic } from "./machines/PlasticsRubber/40084-3";
import { create40082_1Logic } from "./machines/PlasticsRubber/40082-1";
import { create40082_2Logic } from "./machines/PlasticsRubber/40082-2";
import { create40082_3Logic } from "./machines/PlasticsRubber/40082-3";
import { create40084_9Logic } from "./machines/PlasticsRubber/40084-9";
import { create40084_11Logic } from "./machines/PlasticsRubber/40084-11";
import { createWoodWorkingBasicLogic } from "./machines/WoodWorking/ww_basic";
import { createWoodWorkingFullLogic } from "./machines/WoodWorking/ww_full";
import { createbrownfieldMTLogic } from "./machines/machinetool/brownfieldmachinetool";
import { createLaserSystemLogic } from "./machines/LaserSystem/LaserSystem";
import { createUGGgrindingMachineLogic } from "./machines/machinetool/UGGgrindingmachine";
import { createMetalFormingMTLogic } from "./machines/MetalForming/MetalFormingMachine";
import { createJobContolLogic } from "./machines/MyControledMachine/jobcontrol";
import { createMachineToolEnergyLogic } from "./machines/machinetool/machinetool-energy";

export const createAddressSpace = async (
  server: OPCUAServer,
): Promise<void> => {
  const addressSpace = server.engine.addressSpace;
  addressSpace
    ? await Promise.all([
        createOwnServerAddressspaceLogic(addressSpace),
        createJobContolLogic(addressSpace),
        createMyMachineLogic(addressSpace),
        createShowCaseMachineToolLogic(addressSpace),
        createMachineToolExampleLogic(addressSpace),
        createMotionDeviceSystemLogic(addressSpace),
        createGenericPRLogic(addressSpace),
        create40077Logic(addressSpace),
        create40079Logic(addressSpace),
        create40084_3Logic(addressSpace),
        create40082_1Logic(addressSpace),
        create40082_2Logic(addressSpace),
        create40082_3Logic(addressSpace),
        create40084_9Logic(addressSpace),
        create40084_11Logic(addressSpace),
        createWoodWorkingBasicLogic(addressSpace),
        createWoodWorkingFullLogic(addressSpace),
        createbrownfieldMTLogic(addressSpace),
        createLaserSystemLogic(addressSpace),
        createUGGgrindingMachineLogic(addressSpace),
        createMetalFormingMTLogic(addressSpace),
        createMachineToolEnergyLogic(addressSpace)
      ])
        .then(() => {
          green(" Creating AddressSpace done! ");
        })
        .catch((error: Error) => {
          red(` Creating AddressSpace failed!`);
          console.log(error);
          throw error;
        })
    : () => {
        throw new Error(
          " AddressSpace not found! the server has no 'addressSpace' ",
        );
      };
};
