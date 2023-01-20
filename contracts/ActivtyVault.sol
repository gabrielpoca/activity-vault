// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/SystemContractsCaller.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/TransactionHelper.sol";
import "@matterlabs/zksync-contracts/l2/system-contracts/interfaces/IAccount.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import {SignatureChecker} from "@matterlabs/signature-checker/contracts/SignatureChecker.sol";

import "./iActivtyVault.sol";

contract ActivtyVault is IAccount, IActivtyVault, IERC1271 {
    using SignatureChecker for address;
    using TransactionHelper for Transaction;

    address public owner;
    uint256 public lastActivityTimestamp;
    uint256 public inactivitySpan;

    uint256 public membersLength;
    mapping(uint256 => address) public memberAddress;
    mapping(address => bool) public members;

    bytes4 constant EIP1271_SUCCESS_RETURN_VALUE = 0x1626ba7e;

    modifier onlyBootloader() {
        require(
            msg.sender == BOOTLOADER_FORMAL_ADDRESS,
            "Only bootloader can call this method"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == address(this) || msg.sender == owner);

        if (msg.sender == owner) touchActivity();

        _;
    }

    constructor(address _owner, uint256 _inactivitySpan) {
        membersLength = 0;
        owner = _owner;
        lastActivityTimestamp = block.timestamp;
        inactivitySpan = _inactivitySpan;
    }

    function addMember(address _member) external onlyOwner {
        require(members[_member] != true);

        memberAddress[membersLength++] = _member;
        members[_member] = true;
    }

    function removeMember(address _address) external onlyOwner {
        require(members[_address] == true);

        members[_address] = false;

        bool removed = false;

        for (uint256 i = 0; i < membersLength; i++) {
            if (memberAddress[i] == _address) {
                memberAddress[i] = address(0);
                removed = true;
                continue;
            }

            // shifting every address to the left in order to account for
            // the spot that opened during the removal
            if (removed) {
                memberAddress[i - 1] = memberAddress[i];
                memberAddress[i] = address(0);
            }
        }

        membersLength--;
    }

    function _isMultiSig() internal view returns (bool) {
        return (block.timestamp >= lastActivityTimestamp + inactivitySpan);
    }

    function validateTransaction(
        bytes32,
        bytes32 _suggestedSignedHash,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        _validateTransaction(_suggestedSignedHash, _transaction);
    }

    function _validateTransaction(
        bytes32 _suggestedSignedHash,
        Transaction calldata _transaction
    ) internal {
        SystemContractsCaller.systemCall(
            uint32(gasleft()),
            address(NONCE_HOLDER_SYSTEM_CONTRACT),
            0,
            abi.encodeCall(
                INonceHolder.incrementMinNonceIfEquals,
                (_transaction.reserved[0])
            )
        );

        bytes32 txHash;

        if (_suggestedSignedHash == bytes32(0)) {
            txHash = _transaction.encodeHash();
        } else {
            txHash = _suggestedSignedHash;
        }

        require(
            isValidSignature(txHash, _transaction.signature) ==
                EIP1271_SUCCESS_RETURN_VALUE
        );
    }

    function executeTransaction(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        _executeTransaction(_transaction);
    }

    function _executeTransaction(Transaction calldata _transaction) internal {
        address to = address(uint160(_transaction.to));
        uint256 value = _transaction.reserved[1];
        bytes memory data = _transaction.data;

        if (
            !isOwnerSignature(_transaction.encodeHash(), _transaction.signature)
        ) {
            require(_isMultiSig());
        } else {
            touchActivity();
        }

        if (to == address(DEPLOYER_SYSTEM_CONTRACT)) {
            SystemContractsCaller.systemCall(
                uint32(gasleft()),
                to,
                uint128(_transaction.reserved[1]),
                _transaction.data
            );
        } else {
            bool success;
            assembly {
                success := call(
                    gas(),
                    to,
                    value,
                    add(data, 0x20),
                    mload(data),
                    0,
                    0
                )
            }
            require(success);
        }
    }

    function executeTransactionFromOutside(
        Transaction calldata _transaction
    ) external payable {
        _validateTransaction(bytes32(0), _transaction);

        _executeTransaction(_transaction);
    }

    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) public view override returns (bytes4) {
        // each ECDSA signature is 65 bytes long
        require(_signature.length % 65 == 0);

        uint256 signatureCount = _signature.length / 65;

        if (signatureCount == 1) {
            require(isOwnerSignature(_hash, _signature));
        } else {
            require(signatureCount <= membersLength);

            address[] memory signatureAddress = new address[](signatureCount);

            for (uint256 i = 0; i < signatureCount; i++) {
                signatureAddress[i] = ECDSA.recover(
                    _hash,
                    _signature[i * 65:(i + 1) * 65]
                );
            }

            uint256 checked = 0;

            // members and signatures don't need to be in the same order
            for (uint256 m = 0; m < membersLength; m++) {
                for (uint256 s = 0; s < signatureCount; s++) {
                    if (signatureAddress[s] == memberAddress[m]) {
                        checked++;
                        break;
                    }
                }
            }

            require(checked == membersLength);
        }

        return EIP1271_SUCCESS_RETURN_VALUE;
    }

    function isOwnerSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) public view returns (bool) {
        address recoveredAddr = ECDSA.recover(_hash, _signature[0:65]);

        return (recoveredAddr == owner &&
            owner.isValidSignatureNow(_hash, _signature));
    }

    function payForTransaction(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        bool success = _transaction.payToTheBootloader();
        require(success, "Failed to pay the fee to the operator");
    }

    function prePaymaster(
        bytes32,
        bytes32,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        _transaction.processPaymasterInput();
    }

    receive() external payable {
        // If the bootloader called the `receive` function, it likely means
        // that something went wrong and the transaction should be aborted. The bootloader should
        // only interact through the `validateTransaction`/`executeTransaction` methods.
        assert(msg.sender != BOOTLOADER_FORMAL_ADDRESS);
    }

    function touchActivity() internal {
        lastActivityTimestamp = block.timestamp;
    }
}
