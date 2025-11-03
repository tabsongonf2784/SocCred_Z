pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SocCred_Z is ZamaEthereumConfig {
    
    struct CreditData {
        string identifier;              
        euint32 encryptedScore;         
        uint256 publicFactor1;          
        uint256 publicFactor2;          
        string metadata;                
        address owner;                  
        uint256 creationTime;           
        uint32 decryptedScore;          
        bool verificationStatus;        
    }
    
    mapping(string => CreditData) public creditData;
    string[] public creditIds;
    
    event CreditDataRegistered(string indexed creditId, address indexed owner);
    event DecryptionValidated(string indexed creditId, uint32 decryptedScore);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function registerCreditData(
        string calldata creditId,
        string calldata identifier,
        externalEuint32 encryptedScore,
        bytes calldata inputProof,
        uint256 publicFactor1,
        uint256 publicFactor2,
        string calldata metadata
    ) external {
        require(bytes(creditData[creditId].identifier).length == 0, "Credit data already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedScore, inputProof)), "Invalid encrypted input");
        
        creditData[creditId] = CreditData({
            identifier: identifier,
            encryptedScore: FHE.fromExternal(encryptedScore, inputProof),
            publicFactor1: publicFactor1,
            publicFactor2: publicFactor2,
            metadata: metadata,
            owner: msg.sender,
            creationTime: block.timestamp,
            decryptedScore: 0,
            verificationStatus: false
        });
        
        FHE.allowThis(creditData[creditId].encryptedScore);
        FHE.makePubliclyDecryptable(creditData[creditId].encryptedScore);
        
        creditIds.push(creditId);
        emit CreditDataRegistered(creditId, msg.sender);
    }
    
    function validateDecryption(
        string calldata creditId, 
        bytes memory abiEncodedClearScore,
        bytes memory decryptionProof
    ) external {
        require(bytes(creditData[creditId].identifier).length > 0, "Credit data does not exist");
        require(!creditData[creditId].verificationStatus, "Data already verified");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(creditData[creditId].encryptedScore);
        
        FHE.checkSignatures(cts, abiEncodedClearScore, decryptionProof);
        
        uint32 decodedScore = abi.decode(abiEncodedClearScore, (uint32));
        
        creditData[creditId].decryptedScore = decodedScore;
        creditData[creditId].verificationStatus = true;
        
        emit DecryptionValidated(creditId, decodedScore);
    }
    
    function getEncryptedScore(string calldata creditId) external view returns (euint32) {
        require(bytes(creditData[creditId].identifier).length > 0, "Credit data does not exist");
        return creditData[creditId].encryptedScore;
    }
    
    function getCreditData(string calldata creditId) external view returns (
        string memory identifier,
        uint256 publicFactor1,
        uint256 publicFactor2,
        string memory metadata,
        address owner,
        uint256 creationTime,
        bool verificationStatus,
        uint32 decryptedScore
    ) {
        require(bytes(creditData[creditId].identifier).length > 0, "Credit data does not exist");
        CreditData storage data = creditData[creditId];
        
        return (
            data.identifier,
            data.publicFactor1,
            data.publicFactor2,
            data.metadata,
            data.owner,
            data.creationTime,
            data.verificationStatus,
            data.decryptedScore
        );
    }
    
    function getAllCreditIds() external view returns (string[] memory) {
        return creditIds;
    }
    
    function isOperational() public pure returns (bool) {
        return true;
    }
}


