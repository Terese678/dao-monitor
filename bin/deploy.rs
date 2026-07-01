use dao_monitor::dao_monitor::DaoMonitor;
use odra::host::{Deployer, InstallConfig, NoArgs};
use odra::prelude::Addressable;

fn main() {
    // Enable logging so we can see the actual error from livenet env
    env_logger::init();

    let env = odra_casper_livenet_env::env();
    env.set_gas(300_000_000_000u64);
    let cfg = InstallConfig::new::<dao_monitor::dao_monitor::DaoMonitorHostRef>(true, false);
    let contract = DaoMonitor::deploy_with_cfg(&env, NoArgs, cfg);
    println!("DaoMonitor deployed at: {:?}", contract.address());
}
