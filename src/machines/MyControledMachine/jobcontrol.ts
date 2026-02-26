// SPDX-License-Identifier: Apache-2.0
//
// Copyright (c) 2024 Andreas Heine
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

import { randomUUID } from "node:crypto";
import assert from "node:assert";
import {
  AddressSpace,
  DataType,
  InstantiateObjectOptions,
  LocalizedText,
  setNamespaceMetaData,
  UADataType,
  UAObject,
  UAObjectType,
  UAVariable,
  Variant,
  standardUnits,
  UAMethod,
  ISessionContext,
  CallbackT,
  CallMethodResultOptions,
  StatusCodes,
  AddReferenceOpts,
  UAEventType,
  coerceNodeId,
  coerceLocalizedText,
  coerceDateTime,
  ExtensionObject,
} from "node-opcua";
import { ServerRolePermissionGroup } from "../../permissiongroups";
import { green, yellow } from "../../utils/log";
import { ISA95JobOrderDataType } from "./interfaces";
import { ISA95_Method_ReturnCode, JobState } from "./enums";
import { Job } from "./job";

export const createJobContolLogic = async (
  addressSpace: AddressSpace,
): Promise<void> => {
  const diIdx = addressSpace?.getNamespaceIndex(
    "http://opcfoundation.org/UA/DI/",
  );
  const machineryIdx = addressSpace?.getNamespaceIndex(
    "http://opcfoundation.org/UA/Machinery/",
  );
  const machinesFolder = addressSpace?.findNode(
    `ns=${machineryIdx};i=1001`,
  ) as UAObject;

  const namespace = addressSpace?.registerNamespace(
    "http://MyControledMachine-Namespace/UA",
  );
  namespace.setDefaultRolePermissions(ServerRolePermissionGroup.DEFAULT);
  setNamespaceMetaData(namespace);

  const controledMachine = namespace?.addObject({
    browseName: "MyControledMachine",
    nodeId: `ns=${namespace.index};s=MyControledMachine`,
    organizedBy: machinesFolder,
  });

  const machineryBuildingBlocks = namespace.addObject({
    browseName: {
      name: "MachineryBuildingBlocks",
      namespaceIndex: machineryIdx,
    },
    typeDefinition: "FolderType",
    componentOf: controledMachine,
  });

  const machineryIdentificationType = addressSpace?.findNode(
    `ns=${machineryIdx};i=1012`,
  ) as UAObjectType;
  const myMachineIdentification = machineryIdentificationType?.instantiate({
    browseName: {
      name: "Identification",
      namespaceIndex: diIdx,
    },
    namespace: namespace,
    optionals: [], // array of string
  });
  myMachineIdentification.addReference({
    referenceType: "HasAddIn",
    nodeId: controledMachine,
    isForward: false,
  });
  const manufacturer = myMachineIdentification?.getChildByName(
    "Manufacturer",
  ) as UAVariable;
  manufacturer?.setValueFromSource({
    dataType: DataType.LocalizedText,
    value: coerceLocalizedText("Andreas Heine"),
  });
  const uri = myMachineIdentification?.getChildByName(
    "ProductInstanceUri",
  ) as UAVariable;
  uri?.setValueFromSource({
    dataType: DataType.String,
    value: "ProductInstanceUri-123",
  });
  const serial = myMachineIdentification?.getChildByName(
    "SerialNumber",
  ) as UAVariable;
  serial?.setValueFromSource({
    dataType: DataType.String,
    value: "SerialNumber-123",
  });

  const jobIdx = addressSpace?.getNamespaceIndex(
    "http://opcfoundation.org/UA/Machinery/Jobs/",
  );
  const jobManagementType = addressSpace?.findNode(
    `ns=${jobIdx};i=1003`,
  ) as UAObjectType;

  const jobManager = jobManagementType.instantiate({
    componentOf: controledMachine,
    browseName: `JobManager`,
    namespace: namespace,
    optionals: [
      // https://reference.opcfoundation.org/ISA95JOBCONTROL/v200/docs/6.2.1
      "JobOrderControl.StoreAndStart",
      "JobOrderControl.Store",
      "JobOrderControl.Start",
      "JobOrderControl.Update",
      "JobOrderControl.Stop",
      "JobOrderControl.Cancel",
      "JobOrderControl.Clear",
      "JobOrderControl.RevokeStart",
      "JobOrderControl.Pause",
      "JobOrderControl.Abort",
      "JobOrderControl.Resume",
    ],
  } as InstantiateObjectOptions);

  jobManager.addReference({
    referenceType: "HasAddIn",
    nodeId: machineryBuildingBlocks,
    isForward: false,
  });

  const ISA95Idx = addressSpace.getNamespaceIndex(
    "http://opcfoundation.org/UA/ISA95-JOBCONTROL_V2/",
  );

  const ISA95WorkMasterDataType = addressSpace!.findNode(
    `ns=${ISA95Idx};i=3007`,
  ) as UADataType;
  const ISA95ParameterDataType = addressSpace!.findNode(
    `ns=${ISA95Idx};i=3003`,
  ) as UADataType;
  const ISA95JobOrderDataType = addressSpace!.findNode(
    `ns=${ISA95Idx};i=3008`,
  ) as UADataType;
  const ISA95JobResponseDataType = addressSpace!.findNode(
    `ns=${ISA95Idx};i=3013`,
  ) as UADataType;
  const ISA95StateDataType = addressSpace!.findNode(
    `ns=${ISA95Idx};i=3006`,
  ) as UADataType;
  const ISA95JobOrderAndStateDataType = addressSpace!.findNode(
    `ns=${ISA95Idx};i=3015`,
  ) as UADataType;

  const JobOrderControl = jobManager.getComponentByName(
    "JobOrderControl",
  ) as UAObject;
  const JobOrderResults = jobManager.getComponentByName(
    "JobOrderResults",
  ) as UAObject;

  const maxDownloadableJobOrders = JobOrderControl.getPropertyByName(
    "MaxDownloadableJobOrders",
  );
  maxDownloadableJobOrders?.setValueFromSource({
    value: 2 ** 16 - 1,
    dataType: DataType.UInt16,
  });

  const ISA95JobOrderStatusEventType = addressSpace!.findNode(
    `ns=${ISA95Idx};i=1006`,
  ) as UAEventType;

  const MyControledMachineJobOrderResultStatusEventType =
    namespace.addEventType({
      browseName: "MyControledMachineJobOrderResultStatusEventType",
      subtypeOf: ISA95JobOrderStatusEventType,
      isAbstract: false,
    });

  MyControledMachineJobOrderResultStatusEventType.addReference({
    referenceType: `GeneratesEvent`,
    nodeId: JobOrderResults.nodeId,
    isForward: false,
  } as AddReferenceOpts);

  const severObject = addressSpace.findNode(coerceNodeId(`ns=0;i=2253`))!;

  severObject.addReference({
    referenceType: `HasEventSource`,
    nodeId: JobOrderResults.nodeId,
    isForward: true,
  } as AddReferenceOpts);

  function emitISA95JobOrderStatusEvent(job: Job): void {
    green(
      `JobOrderControl(MyControledMachine): raise ISA95JobOrderStatusEvent for JobOrderId='${job.jobOrder.jobOrderID}' JobState='${job.state}'`,
    );
    JobOrderResults.raiseEvent(
      MyControledMachineJobOrderResultStatusEventType,
      {
        jobOrder: new Variant({
          value: addressSpace.constructExtensionObject(
            ISA95JobOrderDataType,
            job.jobOrder as any,
          ),
          dataType: DataType.ExtensionObject,
        }),
        jobResponse: new Variant({
          value: addressSpace.constructExtensionObject(
            ISA95JobResponseDataType,
            {
              // https://reference.opcfoundation.org/ISA95JOBCONTROL/v200/docs/6.3.5
              JobResponseID: `${randomUUID()}`,
              Description: coerceLocalizedText(null),
              JobOrderID: job.jobOrder.jobOrderID,
              StartTime: coerceDateTime(job.startTime),
              EndTime: coerceDateTime(job.endTime),
              JobState: [
                addressSpace.constructExtensionObject(ISA95StateDataType, {
                  // https://reference.opcfoundation.org/ISA95JOBCONTROL/v200/docs/6.3.2
                  BrowsePath: null,
                  StateText: new LocalizedText({
                    locale: "en-EN",
                    text: job.state,
                  }),
                  StateNumber: job.stateNumber,
                }),
              ], // ISA95StateDataType[]
              JobResponseData: [], // ISA95ParameterDataType[]
              PersonnelActuals: [], // ISA95PersonnelDataType[]
              EquipmentActuals: [], // ISA95EquipmentDataType[]
              PhysicalAssetActuals: [], // ISA95PhysicalAssetDataType[]
              MaterialActuals: [], // ISA95MaterialDataType[]
            },
          ),
          dataType: DataType.ExtensionObject,
        }),
        jobState: new Variant({
          value: [
            addressSpace.constructExtensionObject(ISA95StateDataType, {
              // https://reference.opcfoundation.org/ISA95JOBCONTROL/v200/docs/6.3.2
              BrowsePath: null,
              StateText: new LocalizedText({
                locale: "en-EN",
                text: job.state,
              }),
              StateNumber: job!.stateNumber,
            }),
          ],
          dataType: DataType.ExtensionObject,
        }),
      },
    );
  }

  const WorkMaster = JobOrderControl.getComponentByName(
    "WorkMaster",
  ) as UAVariable;

  const JobOrderControlCurrentState = JobOrderControl.getComponentByName(
    "CurrentState",
  ) as UAVariable;
  JobOrderControlCurrentState.setValueFromSource({
    value: coerceLocalizedText(JobState.Running),
    dataType: DataType.LocalizedText,
  });
  const JobOrderControlCurrentStateId =
    JobOrderControlCurrentState.getPropertyByName("Id") as UAVariable;
  JobOrderControlCurrentStateId.setValueFromSource({
    value: coerceNodeId(`ns=${ISA95Idx};i=5037`),
    dataType: DataType.NodeId,
  });

  const JobOrderMap = new Map<string, Job>();

  function startJobOrder(
    JobOrderId: string,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrderId) === false) {
      yellow(
        `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrderId}'`,
      );
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    const job = JobOrderMap.get(JobOrderId);
    const result = job!.start();
    if (result === true) {
      return ISA95_Method_ReturnCode.NoError;
    } else {
      return ISA95_Method_ReturnCode.InvalidRequest;
    }
  }

  function stopJobOrder(
    JobOrderId: string,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrderId) === false) {
      yellow(
        `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrderId}'`,
      );
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    const job = JobOrderMap.get(JobOrderId);
    const result = job!.stop();
    if (result === true) {
      return ISA95_Method_ReturnCode.NoError;
    } else {
      return ISA95_Method_ReturnCode.InvalidRequest;
    }
  }

  function cancelJobOrder(
    JobOrderId: string,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrderId) === false) {
      yellow(
        `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrderId}'`,
      );
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    const job = JobOrderMap.get(JobOrderId);
    const result = job!.cancel();
    if (result === true) {
      return clearJobOrder(JobOrderId, Comment);
    } else {
      return ISA95_Method_ReturnCode.InvalidRequest;
    }
  }

  function revokeStartJobOrder(
    JobOrderId: string,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrderId) === false) {
      yellow(
        `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrderId}'`,
      );
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    const job = JobOrderMap.get(JobOrderId);
    const result = job!.revokeStart();
    if (result === true) {
      return ISA95_Method_ReturnCode.NoError;
    } else {
      return ISA95_Method_ReturnCode.InvalidRequest;
    }
  }

  function pauseJobOrder(
    JobOrderId: string,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrderId) === false) {
      yellow(
        `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrderId}'`,
      );
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    const job = JobOrderMap.get(JobOrderId);
    const result = job!.pause();
    if (result === true) {
      return ISA95_Method_ReturnCode.NoError;
    } else {
      return ISA95_Method_ReturnCode.InvalidRequest;
    }
  }

  function abortJobOrder(
    JobOrderId: string,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrderId) === false) {
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    const job = JobOrderMap.get(JobOrderId);
    const result = job!.abort();
    if (result === true) {
      return ISA95_Method_ReturnCode.NoError;
    } else {
      return ISA95_Method_ReturnCode.InvalidRequest;
    }
  }

  function resumeJobOrder(
    JobOrderId: string,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrderId) === false) {
      yellow(
        `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrderId}'`,
      );
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    const job = JobOrderMap.get(JobOrderId);
    const result = job!.resume();
    if (result === true) {
      return ISA95_Method_ReturnCode.NoError;
    } else {
      return ISA95_Method_ReturnCode.InvalidRequest;
    }
  }

  function updateJobOrder(
    JobOrder: ISA95JobOrderDataType,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrder.jobOrderID) === false) {
      yellow(
        `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrder.jobOrderID}'`,
      );
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    const job = JobOrderMap.get(JobOrder.jobOrderID);
    const result = job!.update(JobOrder);
    if (result === true) {
      return ISA95_Method_ReturnCode.NoError;
    } else {
      return ISA95_Method_ReturnCode.InvalidRequest;
    }
  }

  function storeJobOrder(
    JobOrder: ISA95JobOrderDataType,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    // https://reference.opcfoundation.org/ISA95JOBCONTROL/v100/docs/6.3.2
    /*
            ISA95JobOrderDataType { 
                jobOrderID: 'asdf',
                description: undefined,
                workMasterID: undefined,
                startTime: undefined,
                endTime: undefined,
                priority: undefined,
                jobOrderParameters: undefined,       
                personnelRequirements: undefined,    
                equipmentRequirements: undefined,    
                physicalAssetRequirements: undefined,
                materialRequirements: undefined      
            }
        */
    if (JobOrderMap.has(JobOrder.jobOrderID)) {
      yellow(
        `JobOrderControl(MyControledMachine): JobOrderId='${JobOrder.jobOrderID}' already exist!`,
      );
      return ISA95_Method_ReturnCode.UnableToAcceptJobOrder;
    }
    assert(JobOrder.jobOrderID !== "");
    assert(JobOrder.jobOrderID !== undefined);
    assert(JobOrder.jobOrderID !== null);
    assert(typeof JobOrder.jobOrderID === "string");
    const job = new Job(JobOrder);
    job.on("changed", (job: Job) => {
      updateJobOrderList();
      emitISA95JobOrderStatusEvent(job);
    });
    JobOrderMap.set(JobOrder.jobOrderID, job);
    updateJobOrderList();
    return ISA95_Method_ReturnCode.NoError;
  }

  function clearJobOrder(
    JobOrderId: string,
    Comment: LocalizedText[],
  ): ISA95_Method_ReturnCode {
    if (JobOrderMap.has(JobOrderId) === false) {
      yellow(
        `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrderId}'`,
      );
      return ISA95_Method_ReturnCode.UnknownJobOrderId;
    }
    JobOrderMap.delete(JobOrderId);
    updateJobOrderList();
    return ISA95_Method_ReturnCode.NoError;
  }

  function getJobList(): Job[] {
    return Array.from(JobOrderMap.values()).map((job: Job) => {
      return job;
    });
  }

  setInterval(() => {
    const jobs = getJobList();
    jobs.forEach((job) => {
      switch (job.state) {
        case JobState.AllowedToStart:
          if (job.isStartable()) {
            job.start();
          }
          break;
        case JobState.Running:
          if (
            job.jobOrder.endTime === null ||
            job.jobOrder.endTime === undefined
          ) {
            setTimeout(() => {
              job.stop();
            }, 15 * 1000);
          } else {
            if (job.isStoppable()) {
              job.stop();
            }
          }
          break;
        default:
          break;
      }
    });
  }, 1 * 1000);

  // JobOrderList
  let jobs: ExtensionObject[];

  function updateJobOrderList() {
    green(`JobOrderControl(MyControledMachine): Updating JobOrderList`);
    const list = getJobList();
    jobs = list.map((job) => {
      return addressSpace.constructExtensionObject(
        ISA95JobOrderAndStateDataType,
        job.getJobOrderAndState(),
      );
    });
  }

  const JobOrderList = JobOrderControl.getComponentByName(
    "JobOrderList",
  ) as UAVariable;
  JobOrderList.bindVariable(
    {
      get: function (this: UAVariable): Variant {
        return new Variant({
          value: jobs,
          dataType: DataType.ExtensionObject,
        });
      },
    },
    true,
  );

  // Methods

  const StoreAndStart = JobOrderControl.getMethodByName(
    "StoreAndStart",
  ) as UAMethod;
  StoreAndStart.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method receives a new job order and stores the new job order in local storage, and start it as soon as the Job Order receiver is ready to start. After successful execution of the method, the JobOrderList shall have a new entry in state AllowedToStart. Note: the system may internally start executing the job order immediately, so potentially the job order is already in a different state when accessed the first time.
            The signature of this Method is specified below. Table 17 and Table 18 specify the Arguments and AddressSpace representation, respectively.
            StoreAndStart (
                [in]ISA95JobOrderDataType JobOrder
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            ); 
        */
    green(
      `JobOrderControl(MyControledMachine).StoreAndStart: sessionId='${context.session?.getSessionId()} jobOrderId='${(inputArguments[0].value as ISA95JobOrderDataType).jobOrderID}'`,
    );
    try {
      let rc;
      rc = storeJobOrder(inputArguments[0].value, inputArguments[1].value);
      if (rc === ISA95_Method_ReturnCode.NoError) {
        rc = startJobOrder(
          (inputArguments[0].value as ISA95JobOrderDataType).jobOrderID,
          inputArguments[1].value,
        );
      }
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Store = JobOrderControl.getMethodByName("Store") as UAMethod;
  Store.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method receives a new job order and stores the new job order in local storage, but does not start the job order. After successful execution of the method, the JobOrderList shall have a new entry in state NotAllowedToStart.
            The signature of this Method is specified below. Table 15 and Table 16 specify the Arguments and AddressSpace representation, respectively.
            Store (
                [in]ISA95JobOrderDataType JobOrder
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            ); 
        */
    green(
      `JobOrderControl(MyControledMachine).Store: sessionId='${context.session?.getSessionId()}' jobOrderId='${(inputArguments[0].value as ISA95JobOrderDataType).jobOrderID}'`,
    );
    try {
      const rc = storeJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Start = JobOrderControl.getMethodByName("Start") as UAMethod;
  Start.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method starts a job order as soon as the Job Order receiver is ready to start. After successful execution of the method, job order in the JobOrderList shall be in state AllowedToStart.
            If multiple job orders have been commanded to start, then the priority and timing values in the job orders shall be used to determine the order of execution of the job orders.
            The signature of this Method is specified below. Table 19 and Table 20 specify the Arguments and AddressSpace representation, respectively.
            Start (
                [in]0:String JobOrderID
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).Start: sessionId='${context.session?.getSessionId()}' jobOrderId='${inputArguments[0].value}'`,
    );
    try {
      const rc = startJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Update = JobOrderControl.getMethodByName("Update") as UAMethod;
  Update.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method updates an existing job order that has not yet been started, with the new order information. All previously stored information is replaced.
            The signature of this Method is specified below. Table 27 and Table 28 specify the Arguments and AddressSpace representation, respectively.
            Update (
                [in]ISA95JobOrderDataType JobOrder
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).Update: sessionId='${context.session?.getSessionId()}' jobOrderId='${(inputArguments[0].value as ISA95JobOrderDataType).jobOrderID}'`,
    );
    try {
      const rc = updateJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Stop = JobOrderControl.getMethodByName("Stop") as UAMethod;
  Stop.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method stops a started job order. After successful execution of the method, job order in the JobOrderList shall be in state Ended.
            The signature of this Method is specified below. Table 31 and Table 32 specify the Arguments and AddressSpace representation, respectively.
            Stop (
                [in]0:String JobOrderID
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).Stop: sessionId='${context.session?.getSessionId()}' jobOrderId='${inputArguments[0].value}'`,
    );
    try {
      const rc = stopJobOrder(inputArguments[0].value, inputArguments[1].value);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Cancel = JobOrderControl.getMethodByName("Cancel") as UAMethod;
  Cancel.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method cancels a not started job order (in AllowedToStart or NotAllowedToStart) and removes the stored information. After successful execution of the method, there shall be no job order with the JobOrderID in the JobOrderList.
            The signature of this Method is specified below. Table 33 and Table 34 specify the Arguments and AddressSpace representation, respectively.
            Cancel (
                [in]0:String JobOrderID
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).Cancel: sessionId='${context.session?.getSessionId()}' jobOrderId='${inputArguments[0].value}'`,
    );
    try {
      const rc = cancelJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Clear = JobOrderControl.getMethodByName("Clear") as UAMethod;
  Clear.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method clears any maintained information on the Job Order (usually sent after a receipt of a Job Response with a status of Finished.). After successful execution of the method, there shall be no job order with the JobOrderID in the JobOrderList.
            Note: It is server-specific whether Job Orders get cleared by the Server automatically when it runs out of resources or after a period of time or other reasons.
            The signature of this Method is specified below. Table 35 and Table 36 specify the Arguments and AddressSpace representation, respectively.
            Clear (
                [in]0:String JobOrderID
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).Clear: sessionId='${context.session?.getSessionId()}' jobOrderId='${inputArguments[0].value}'`,
    );
    try {
      const rc = clearJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const RevokeStart = JobOrderControl.getMethodByName(
    "RevokeStart",
  ) as UAMethod;
  RevokeStart.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method revokes a not started job (in AllowedToStart). After successful execution of the method, job order in the JobOrderList shall be in state NotAllowedToStart.
            The signature of this Method is specified below. Table 21 and Table 22 specify the Arguments and AddressSpace representation, respectively.
            RevokeStart (
                [in]0:String JobOrderID
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).RevokeStart: sessionId='${context.session?.getSessionId()}' jobOrderId='${inputArguments[0].value}'`,
    );
    try {
      const rc = revokeStartJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Pause = JobOrderControl.getMethodByName("Pause") as UAMethod;
  Pause.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method pauses a started job. After successful execution of the method, job order in the JobOrderList shall be in state Interrupted.
            The signature of this Method is specified below. Table 23 and Table 24 specify the Arguments and AddressSpace representation, respectively.
            Pause (
                [in]0:String JobOrderID
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).Pause: sessionId='${context.session?.getSessionId()}' jobOrderId='${inputArguments[0].value}'`,
    );
    try {
      const rc = pauseJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Abort = JobOrderControl.getMethodByName("Abort") as UAMethod;
  Abort.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method aborts a job order. After successful execution of the method, job order in the JobOrderList shall be in state Aborted.
            The signature of this Method is specified below. Table 29 and Table 30 specify the Arguments and AddressSpace representation, respectively.
            Abort (
                [in]0:String JobOrderID
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).Abort: sessionId='${context.session?.getSessionId()}' jobOrderId='${inputArguments[0].value}'`,
    );
    try {
      const rc = abortJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });
  const Resume = JobOrderControl.getMethodByName("Resume") as UAMethod;
  Resume.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method resumes an interrupted job (in state Interrupted). After successful execution of the method, job order in the JobOrderList shall be in state Running.
            The signature of this Method is specified below. Table 25 and Table 26 specify the Arguments and AddressSpace representation, respectively.
            Resume (
                [in]0:String JobOrderID
                [in]LocalizedText[] Comment
                [out]0:UInt64 ReturnStatus
            );
        */
    green(
      `JobOrderControl(MyControledMachine).Resume: sessionId='${context.session?.getSessionId()}' jobOrderId='${inputArguments[0].value}'`,
    );
    try {
      const rc = resumeJobOrder(
        inputArguments[0].value,
        inputArguments[1].value,
      );
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });

  const RequestJobResponseByJobOrderID = JobOrderResults.getMethodByName(
    "RequestJobResponseByJobOrderID",
  ) as UAMethod;
  RequestJobResponseByJobOrderID.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method is used to return Job Responses for unsolicited requests for responses from a job order.
            The signature of this Method is specified below. Table 51 and Table 52 specify the Arguments and AddressSpace representation, respectively.
            RequestJobResponseByJobOrderID (
                [in]0:String JobOrderID
                [out]ISA95JobResponseDataTypeJobResponse
                [out]0:UInt64 ReturnStatus
            );
        */
    try {
      const JobOrderId = inputArguments[0].value;
      let rc = ISA95_Method_ReturnCode.NoError;
      if (JobOrderMap.has(JobOrderId) === false) {
        yellow(
          `JobOrderControl(MyControledMachine): Unknown JobOrderId='${JobOrderId}'`,
        );
        rc = ISA95_Method_ReturnCode.UnknownJobOrderId;
        callback(null, {
          // statusCode?: StatusCode;
          statusCode: StatusCodes.Good,
          // inputArgumentResults?: StatusCode[] | null;
          // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
          // outputArguments?: (VariantLike | null)[] | null;
          outputArguments: [
            new Variant({
              value: addressSpace.constructExtensionObject(
                ISA95JobResponseDataType,
                {},
              ),
              dataType: DataType.ExtensionObject,
            }),
            new Variant({
              value: rc,
              dataType: DataType.UInt64,
            }),
          ],
        } as CallMethodResultOptions);
      }

      const job = JobOrderMap.get(JobOrderId);

      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.Good,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        outputArguments: [
          new Variant({
            value: addressSpace.constructExtensionObject(
              ISA95JobResponseDataType,
              {
                // https://reference.opcfoundation.org/ISA95JOBCONTROL/v200/docs/6.3.5
                JobResponseID: `${randomUUID()}`,
                Description: coerceLocalizedText(null),
                JobOrderID: JobOrderId,
                StartTime: coerceDateTime(job!.startTime),
                EndTime: coerceDateTime(job!.endTime),
                JobState: [
                  addressSpace.constructExtensionObject(ISA95StateDataType, {
                    // https://reference.opcfoundation.org/ISA95JOBCONTROL/v200/docs/6.3.2
                    BrowsePath: null,
                    StateText: new LocalizedText({
                      locale: "en-EN",
                      text: job!.state,
                    }),
                    StateNumber: job!.stateNumber,
                  }),
                ], // ISA95StateDataType[]
                JobResponseData: [], // ISA95ParameterDataType[]
                PersonnelActuals: [], // ISA95PersonnelDataType[]
                EquipmentActuals: [], // ISA95EquipmentDataType[]
                PhysicalAssetActuals: [], // ISA95PhysicalAssetDataType[]
                MaterialActuals: [], // ISA95MaterialDataType[]
              },
            ),
            dataType: DataType.ExtensionObject,
          }),
          new Variant({
            value: rc,
            dataType: DataType.UInt64,
          }),
        ],
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });

  const RequestJobResponseByJobOrderState = JobOrderResults.getMethodByName(
    "RequestJobResponseByJobOrderState",
  ) as UAMethod;
  RequestJobResponseByJobOrderState.bindMethod(function (
    this: UAMethod,
    inputArguments: Variant[],
    context: ISessionContext,
    callback: CallbackT<CallMethodResultOptions>,
  ): void {
    /*
            This Method is used to return Job Responses for unsolicited requests for responses from a job order.
            The signature of this Method is specified below. Table 53 and Table 54 specify the Arguments and AddressSpace representation, respectively.
            RequestJobResponseByJobOrderState (
                [in] ISA95StateDataType[] JobOrderState
                [out]ISA95JobResponseDataType[]JobResponses
                [out]0:UInt64 ReturnStatus
            ); 
        */
    try {
      // TODO !!!
      // const states: Variant[] = []
      // const JobOrderStates = inputArguments[0].value // might be an array
      // JobOrderStates.forEach((JobOrderState: any) => {
      //   getJobList().forEach((job: Job) => {
      //     if (job.state === JobOrderState.StateText) {
      //       states.push(
      //         new Variant({
      //           value: addressSpace.constructExtensionObject(
      //             ISA95JobResponseDataType,
      //             {
      //               // https://reference.opcfoundation.org/ISA95JOBCONTROL/v200/docs/6.3.5
      //               ID: `${randomUUID()}`,
      //               Description: coerceLocalizedText(null),
      //               JobOrderID: job.jobOrder.jobOrderID,
      //               StartTime: coerceDateTime(job!.startTime),
      //               EndTime: coerceDateTime(job!.endTime),
      //               JobState: [
      //                 addressSpace.constructExtensionObject(ISA95StateDataType, {
      //                   // https://reference.opcfoundation.org/ISA95JOBCONTROL/v200/docs/6.3.2
      //                   BrowsePath: null,
      //                   StateText: new LocalizedText({
      //                     locale: "en-EN",
      //                     text: job!.state,
      //                   }),
      //                   StateNumber: job!.stateNumber,
      //                 }),
      //               ], // ISA95StateDataType[]
      //               JobResponseData: [], // ISA95ParameterDataType[]
      //               PersonnelActuals: [], // ISA95PersonnelDataType[]
      //               EquipmentActuals: [], // ISA95EquipmentDataType[]
      //               PhysicalAssetActuals: [], // ISA95PhysicalAssetDataType[]
      //               MaterialActuals: [], // ISA95MaterialDataType[]
      //             },
      //           ),
      //           dataType: DataType.ExtensionObject,
      //         }),
      //       )
      //     }
      //   })
      // })
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadNotImplemented,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
        // outputArguments: [
        //   states,
        //   new Variant({
        //     value: ISA95_Method_ReturnCode.NoError,
        //     dataType: DataType.UInt64,
        //   }),
        // ]
      } as CallMethodResultOptions);
    } catch (error) {
      console.log(error);
      callback(null, {
        // statusCode?: StatusCode;
        statusCode: StatusCodes.BadInternalError,
        // inputArgumentResults?: StatusCode[] | null;
        // inputArgumentDiagnosticInfos?: (DiagnosticInfo | null)[] | null;
        // outputArguments?: (VariantLike | null)[] | null;
      } as CallMethodResultOptions);
    }
  });

  // Available WorkMasters

  const subpobj1 = addressSpace.constructExtensionObject(
    ISA95ParameterDataType,
    {
      ID: "Sub1",
      description: [
        new LocalizedText({ locale: "de-DE", text: "SubParameter1" }),
      ],
      value: new Variant({ value: 60.1, dataType: DataType.Double }),
      engineeringUnits: standardUnits.degree_fahrenheit,
      subparameters: [],
    },
  );

  const pobj1 = addressSpace.constructExtensionObject(ISA95ParameterDataType, {
    ID: "P1",
    description: [new LocalizedText({ locale: "de-DE", text: "Parameter1" })],
    value: new Variant({ value: 23.5, dataType: DataType.Double }),
    engineeringUnits: standardUnits.degree_celsius,
    subparameters: [subpobj1],
  });

  const pobj2 = addressSpace.constructExtensionObject(ISA95ParameterDataType, {
    ID: "P2",
    description: [new LocalizedText({ locale: "de-DE", text: "Parameter2" })],
    value: new Variant({ value: 23.5, dataType: DataType.Double }),
    engineeringUnits: standardUnits.degree_celsius,
    subparameters: [subpobj1],
  });

  const wmObj1 = addressSpace.constructExtensionObject(
    ISA95WorkMasterDataType,
    {
      ID: "Recipe_1",
      description: new LocalizedText({ locale: "de-DE", text: "Rezept 1" }),
      parameters: [pobj1, pobj1],
    },
  );

  const wmObj2 = addressSpace.constructExtensionObject(
    ISA95WorkMasterDataType,
    {
      ID: "Recipe_2",
      description: new LocalizedText({ locale: "de-DE", text: "Rezept 2" }),
      parameters: [pobj2, pobj2],
    },
  );

  WorkMaster.setValueFromSource({
    value: [wmObj1, wmObj2],
    dataType: DataType.ExtensionObject,
  });
};
