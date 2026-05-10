// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {AgentRegistry} from "../AgentRegistry.sol";

contract Deploy is Script {
    function run() external {
        address reporter = vm.envAddress("REPORTER_ADDRESS");
        
        vm.startBroadcast();
        new AgentRegistry(reporter);
        vm.stopBroadcast();
    }
}