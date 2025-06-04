// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    // Proposal structure
    struct Proposal {
        string name;
        uint256 voteCount;
    }

    // Array of proposals
    Proposal[] public proposals;

    // Mapping to track if an address has voted
    mapping(address => bool) public hasVoted;

    // Event for when a vote is cast
    event VoteCast(address indexed voter, uint256 proposalId);

    // Constructor to initialize proposals
    constructor(string[] memory proposalNames) {
        for (uint i = 0; i < proposalNames.length; i++) {
            proposals.push(Proposal({
                name: proposalNames[i],
                voteCount: 0
            }));
        }
    }

    // Function to vote for a proposal
    function vote(uint256 proposalId) external {
        require(!hasVoted[msg.sender], "Already voted");
        require(proposalId < proposals.length, "Invalid proposal");

        proposals[proposalId].voteCount++;
        hasVoted[msg.sender] = true;

        emit VoteCast(msg.sender, proposalId);
    }

    // Function to get the winning proposal
    function winningProposal() public view returns (uint256 winningProposalId) {
        uint256 winningVoteCount = 0;
        for (uint i = 0; i < proposals.length; i++) {
            if (proposals[i].voteCount > winningVoteCount) {
                winningVoteCount = proposals[i].voteCount;
                winningProposalId = i;
            }
        }
    }

    // Function to get the winner's name
    function winnerName() external view returns (string memory winnerName_) {
        winnerName_ = proposals[winningProposal()].name;
    }
}