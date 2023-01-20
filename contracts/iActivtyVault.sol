// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IActivtyVault {
    function addMember(address _member) external;

    function removeMember(address _member) external;
}
