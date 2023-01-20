// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/SystemContractsCaller.sol";

contract WFactory {
    bytes32 public aaBytecodeHash;

    constructor(bytes32 _wBytecodeHash) {
        aaBytecodeHash = _wBytecodeHash;
    }

    function deployAccount(
        bytes32 salt,
        address owner,
        uint thresholdDays
    ) external returns (address accountAddress) {
        (bool success, bytes memory returnData)   = SystemContractsCaller.systemCallWithReturndata(
            uint32(gasleft()),
            address(DEPLOYER_SYSTEM_CONTRACT),
            uint128(0),
            abi.encodeCall(
                DEPLOYER_SYSTEM_CONTRACT.create2Account,
                (salt, aaBytecodeHash, abi.encode(owner, thresholdDays))
            )
        );

        require(success, "Deployment failed");

        (accountAddress, ) = abi.decode(returnData, (address, bytes));
    }
}
