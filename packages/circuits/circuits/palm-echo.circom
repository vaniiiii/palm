pragma circom 2.1.5;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "@zk-email/circuits/email-verifier.circom";
include "@zk-email/circuits/utils/regex.circom";
include "@zk-email/circuits/utils/hash.circom";
include "@zk-email/zk-regex-circom/circuits/common/to_addr_regex.circom";
include "./echo-kyc-regex.circom";

template PalmEchoVerifier(maxHeadersLength, maxBodyLength, n, k) {
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;
    signal input pubkey[k];
    signal input signature[k];
    signal input emailBody[maxBodyLength];
    signal input emailBodyLength;
    signal input bodyHashIndex;
    signal input precomputedSHA[32];
    signal input toEmailIndex;
    signal input address;

    signal output pubkeyHash;
    signal output emailNullifier;

    component EV = EmailVerifier(maxHeadersLength, maxBodyLength, n, k, 0, 0, 0, 0);
    EV.emailHeader <== emailHeader;
    EV.pubkey <== pubkey;
    EV.signature <== signature;
    EV.emailHeaderLength <== emailHeaderLength;
    EV.bodyHashIndex <== bodyHashIndex;
    EV.precomputedSHA <== precomputedSHA;
    EV.emailBody <== emailBody;
    EV.emailBodyLength <== emailBodyLength;
    pubkeyHash <== EV.pubkeyHash;

    component echoRegex = EchoKycRegex(maxBodyLength);
    echoRegex.msg <== emailBody;
    echoRegex.out === 1;

    signal (toFound, toReveal[maxHeadersLength]) <== ToAddrRegex(maxHeadersLength)(emailHeader);
    toFound === 1;

    signal isToIndexValid <== LessThan(log2Ceil(maxHeadersLength))([toEmailIndex, emailHeaderLength]);
    isToIndexValid === 1;

    var maxEmailLength = 255;
    signal toEmailPacks[9] <== PackRegexReveal(maxHeadersLength, maxEmailLength)(toReveal, toEmailIndex);

    component nullifierHash = Poseidon(9);
    for (var i = 0; i < 9; i++) {
        nullifierHash.inputs[i] <== toEmailPacks[i];
    }
    emailNullifier <== nullifierHash.out;
}

component main { public [ address ] } = PalmEchoVerifier(1024, 4096, 121, 17);
