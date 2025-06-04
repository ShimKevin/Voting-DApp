const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Voting Contract", function () {
  let Voting;
  let voting;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    
    const proposalNames = ["Proposal 1", "Proposal 2"];
    Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy(proposalNames);
    await voting.waitForDeployment();
  });

  it("Should initialize proposals correctly", async function () {
    expect(await voting.proposals(0)).to.exist;
    expect(await voting.proposals(1)).to.exist;
  });

  it("Should allow voting", async function () {
    await voting.connect(addr1).vote(0);
    const proposal = await voting.proposals(0);
    expect(proposal.voteCount).to.equal(1);
  });

  it("Should prevent double voting", async function () {
    await voting.connect(addr1).vote(0);
    await expect(voting.connect(addr1).vote(0))
      .to.be.revertedWith("Already voted");
  });
});